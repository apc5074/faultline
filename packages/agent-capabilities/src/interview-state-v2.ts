import type { InterviewChatAssessment } from "./interview-assessment.js";
import type { InterviewV2QuestionKind, InterviewV2SlotId } from "./interview-question.js";
import { safeParseInterviewEvaluation, type InterviewEvaluationResult } from "./interview-protocol.js";

export type InterviewV2Status =
  | "selecting_question"
  | "refreshing_question"
  | "paused_not_ready"
  | "awaiting_chat_answer"
  | "awaiting_chat_evaluation"
  | "awaiting_canvas_change"
  | "awaiting_scenario_review"
  | "awaiting_scenario_critique"
  | "completed"
  | "stale"
  | "abandoned";

export type InterviewV2Verdict = "correct" | "partial" | "incorrect";

export interface InterviewV2DiscussionQuestion {
  readonly kind: Extract<InterviewV2QuestionKind, "request_path" | "component_justification" | "challenge_edge_case" | "live_failure">;
  readonly slotId: InterviewV2SlotId;
  readonly questionId: string;
  readonly ordinal: number;
  readonly prompt: string;
  readonly evidenceRevision: string;
  /** Agent-facing rubric/evidence for evaluating the player's answer. */
  readonly assessment: InterviewChatAssessment;
  /** Optional canvas spotlight target for chat-graded failure questions. */
  readonly targetComponentId?: string;
}

export interface InterviewV2LiveQuestion {
  readonly kind: Extract<InterviewV2QuestionKind, "live_scale">;
  readonly slotId: InterviewV2SlotId;
  readonly questionId: string;
  readonly ordinal: number;
  readonly prompt: string;
  readonly evidenceRevision: string;
  readonly targetComponentId: string;
  readonly calibrationId: string;
  readonly coachingObjective: string;
}

export type InterviewV2Question = InterviewV2DiscussionQuestion | InterviewV2LiveQuestion;

/** Canonical chat-slot evaluation; same shape the production submit_interview_answer tool requires. */
export type InterviewV2AnswerEvaluation = InterviewEvaluationResult;

export interface InterviewV2SlotOutcome {
  readonly slotId: InterviewV2SlotId;
  readonly questionId: string;
  readonly kind: InterviewV2QuestionKind;
  readonly evidenceRevision: string;
  readonly evaluation?: InterviewV2AnswerEvaluation;
  readonly liveCritique?: string;
}

export interface InterviewV2State {
  readonly interviewId: string;
  readonly architectureRevision: string;
  readonly challengeId: string;
  readonly challengeVersion: number;
  readonly simulatorVersion: string;
  readonly questions: readonly InterviewV2Question[];
  readonly currentQuestion: InterviewV2Question | null;
  readonly currentQuestionIndex: number;
  readonly status: InterviewV2Status;
  readonly completedSlots: readonly InterviewV2SlotOutcome[];
  readonly followUps: readonly InterviewV2FollowUp[];
  readonly activeReviewDigest?: string;
  readonly acceptedCheckpointRevision?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
}

export interface InterviewV2FollowUp {
  readonly followUpId: string;
  readonly questionId: string;
  readonly answer: string;
  readonly createdAt: string;
}

export type InterviewV2StartEvent = Omit<InterviewV2State, "currentQuestion" | "currentQuestionIndex" | "status" | "completedSlots" | "followUps" | "activeReviewDigest" | "acceptedCheckpointRevision" | "completedAt"> & {
  readonly type: "start";
};

export type InterviewV2Event =
  | { readonly type: "answer"; readonly questionId: string; readonly answer: string; readonly evaluation: InterviewV2AnswerEvaluation }
  | { readonly type: "semantic_edit"; readonly architectureRevision: string }
  | { readonly type: "scenario_review"; readonly questionId: string; readonly architectureRevision: string; readonly passed: boolean; readonly reviewDigest?: string; readonly critique?: string }
  | { readonly type: "scenario_critique"; readonly questionId: string; readonly architectureRevision: string; readonly reviewDigest: string; readonly critique: string }
  | { readonly type: "refresh_question"; readonly question: InterviewV2Question }
  | { readonly type: "prerequisite_lost" }
  | { readonly type: "prerequisite_restored" }
  | { readonly type: "follow_up"; readonly questionId: string; readonly followUpId: string; readonly answer: string; readonly createdAt: string }
  | { readonly type: "stale" }
  | { readonly type: "abandon" }
  | { readonly type: "resume" };

export type InterviewV2TransitionResult =
  | { readonly ok: true; readonly state: InterviewV2State }
  | { readonly ok: false; readonly code: InterviewV2TransitionErrorCode; readonly message: string };

export type InterviewV2TransitionErrorCode =
  | "INVALID_INPUT"
  | "WRONG_QUESTION"
  | "ILLEGAL_TRANSITION"
  | "STALE"
  | "COMPLETED"
  | "ABANDONED"
  | "REVIEW_REQUIRED"
  | "REVIEW_STALE"
  | "PREREQUISITE_REQUIRED";

/**
 * TEMP: drop live-scale until viral-workload calibration is reliable.
 * Flip to false to restore the five-slot agenda including live-scale-v2.
 */
export const INTERVIEW_V2_SKIP_LIVE_SCALE = true;

export const INTERVIEW_V2_SLOT_ORDER: readonly InterviewV2SlotId[] = INTERVIEW_V2_SKIP_LIVE_SCALE
  ? ["request-path-v2", "component-justification-v2", "challenge-edge-case-v2", "live-failure-v2"]
  : ["request-path-v2", "component-justification-v2", "live-scale-v2", "challenge-edge-case-v2", "live-failure-v2"];

const discussionKinds = new Set(["request_path", "component_justification", "challenge_edge_case", "live_failure"]);
const liveKinds = new Set(["live_scale"]);

function failure(code: InterviewV2TransitionErrorCode, message: string): InterviewV2TransitionResult {
  return { ok: false, code, message };
}

function validateAssessment(question: InterviewV2DiscussionQuestion): string | undefined {
  const assessment = question.assessment;
  if (!assessment || assessment.slotId !== question.slotId) return "Discussion questions require an assessment matching the slot.";
  if (!Array.isArray(assessment.requiredTopics) || assessment.requiredTopics.length === 0 || assessment.requiredTopics.length > 8) return "Assessment requiredTopics must be bounded.";
  if (!Array.isArray(assessment.evidenceSummary) || assessment.evidenceSummary.length === 0 || assessment.evidenceSummary.length > 8) return "Assessment evidenceSummary must be bounded.";
  if (!assessment.evidenceBasis.trim() || !assessment.assessGuidance.trim()) return "Assessment evidenceBasis and assessGuidance are required.";
  return undefined;
}

function validateQuestions(questions: readonly InterviewV2Question[]): string | undefined {
  if (questions.length !== INTERVIEW_V2_SLOT_ORDER.length) {
    return `Interview v2 requires exactly ${INTERVIEW_V2_SLOT_ORDER.length} questions.`;
  }
  const ids = new Set<string>();
  for (const [index, question] of questions.entries()) {
    if (question.ordinal !== index + 1 || question.slotId !== INTERVIEW_V2_SLOT_ORDER[index]) return "Questions must use the stable slot order.";
    if (ids.has(question.questionId) || question.questionId.trim().length === 0) return "Question IDs must be unique and non-empty.";
    ids.add(question.questionId);
    if (question.prompt.trim().length === 0 || question.prompt.length > 240 || question.evidenceRevision.trim().length === 0) return "Question prompts and evidence revisions must be bounded.";
    if (discussionKinds.has(question.kind)) {
      const assessmentError = validateAssessment(question as InterviewV2DiscussionQuestion);
      if (assessmentError) return assessmentError;
      if (question.kind === "live_failure" && (!question.targetComponentId || question.targetComponentId.trim().length === 0)) {
        return "Failure discussion slots require a targetComponentId for canvas spotlight.";
      }
    } else if (liveKinds.has(question.kind)) {
      const live = question as InterviewV2LiveQuestion;
      if (live.targetComponentId.trim().length === 0 || live.calibrationId.trim().length === 0 || live.coachingObjective.trim().length === 0) {
        return "Live slots require a target, calibration, and coaching objective.";
      }
    } else {
      return "Unknown interview question kind.";
    }
  }
  return undefined;
}

function current(state: InterviewV2State, questionId: string): InterviewV2TransitionResult | undefined {
  if (!state.currentQuestion || state.currentQuestion.questionId !== questionId) return failure("WRONG_QUESTION", `Expected current question "${state.currentQuestion?.questionId ?? "none"}".`);
  return undefined;
}

function active(state: InterviewV2State): InterviewV2TransitionResult | undefined {
  if (state.status === "completed") return failure("COMPLETED", "The design interview is complete.");
  if (state.status === "abandoned") return failure("ABANDONED", "The design interview was abandoned.");
  if (state.status === "stale") return failure("STALE", "The interview is stale and needs a fresh preflight.");
  return undefined;
}

function statusFor(question: InterviewV2Question): InterviewV2Status {
  return question.kind === "live_scale" ? "awaiting_canvas_change" : "awaiting_chat_answer";
}

function advance(state: InterviewV2State, outcome: InterviewV2SlotOutcome, completedAt?: string): InterviewV2State {
  const nextIndex = state.currentQuestionIndex + 1;
  const next = state.questions[nextIndex] ?? null;
  return {
    ...state,
    currentQuestion: next,
    currentQuestionIndex: nextIndex,
    status: next ? statusFor(next) : "completed",
    completedSlots: [...state.completedSlots, outcome],
    ...(next ? {} : { completedAt: completedAt ?? new Date(0).toISOString() }),
    activeReviewDigest: undefined,
  };
}

export function createInterviewV2State(event: InterviewV2StartEvent): InterviewV2TransitionResult {
  if (!event.interviewId.trim() || !event.architectureRevision.trim() || !event.challengeId.trim() || !event.simulatorVersion.trim()) return failure("INVALID_INPUT", "Interview identity and trusted revisions are required.");
  if (!Number.isInteger(event.challengeVersion) || event.challengeVersion < 1) return failure("INVALID_INPUT", "Challenge version must be a positive integer.");
  const questionError = validateQuestions(event.questions);
  if (questionError) return failure("INVALID_INPUT", questionError);
  const first = event.questions[0]!;
  return { ok: true, state: { interviewId: event.interviewId, architectureRevision: event.architectureRevision, challengeId: event.challengeId, challengeVersion: event.challengeVersion, simulatorVersion: event.simulatorVersion, questions: event.questions, currentQuestion: first, currentQuestionIndex: 0, status: "awaiting_chat_answer", completedSlots: [], followUps: [], startedAt: event.startedAt } };
}

export function transitionInterviewV2(state: InterviewV2State, event: InterviewV2Event): InterviewV2TransitionResult {
  if (event.type === "abandon") {
    if (state.status === "completed") return failure("COMPLETED", "The design interview is complete.");
    if (state.status === "abandoned") return { ok: true, state };
    return { ok: true, state: { ...state, status: "abandoned" } };
  }
  if (event.type === "stale") {
    if (state.status === "completed") return failure("COMPLETED", "A completed interview cannot become stale.");
    return { ok: true, state: { ...state, status: "stale" } };
  }
  if (event.type === "resume") {
    if (state.status !== "paused_not_ready") return failure("ILLEGAL_TRANSITION", "Only a paused interview can resume.");
    return { ok: true, state: { ...state, status: state.currentQuestion ? statusFor(state.currentQuestion) : "completed" } };
  }
  const activeError = active(state);
  if (activeError) return activeError;
  if (event.type === "prerequisite_lost") return { ok: true, state: { ...state, status: "paused_not_ready" } };
  if (event.type === "prerequisite_restored") return { ok: true, state: { ...state, status: state.currentQuestion ? statusFor(state.currentQuestion) : "completed" } };
  if (event.type === "refresh_question") {
    if (!state.currentQuestion || event.question.slotId !== state.currentQuestion.slotId || event.question.ordinal !== state.currentQuestion.ordinal) return failure("WRONG_QUESTION", "A refresh must replace only the current slot.");
    return { ok: true, state: { ...state, currentQuestion: event.question, status: "refreshing_question" } };
  }
  if (event.type === "semantic_edit") {
    if (!event.architectureRevision.trim()) return failure("INVALID_INPUT", "Architecture revision is required.");
    if (state.currentQuestion?.kind === "request_path" || state.currentQuestion?.kind === "component_justification" || state.currentQuestion?.kind === "challenge_edge_case" || state.currentQuestion?.kind === "live_failure") return { ok: true, state: { ...state, architectureRevision: event.architectureRevision, status: "refreshing_question" } };
    return { ok: true, state: { ...state, architectureRevision: event.architectureRevision, status: "awaiting_canvas_change", activeReviewDigest: undefined } };
  }
  if (!state.currentQuestion) return failure("ILLEGAL_TRANSITION", "The interview has no current question.");
  const wrong = event.type === "follow_up" ? undefined : ("questionId" in event ? current(state, event.questionId) : undefined);
  if (wrong) return wrong;
  if (event.type === "answer") {
    if (!discussionKinds.has(state.currentQuestion.kind)) return failure("ILLEGAL_TRANSITION", "Live slots cannot accept chat answers.");
    if (state.status !== "awaiting_chat_answer" && state.status !== "awaiting_chat_evaluation" && state.status !== "refreshing_question") return failure("ILLEGAL_TRANSITION", "The current chat slot is not accepting an answer.");
    if (!event.answer.trim() || event.answer.length > 20_000) return failure("INVALID_INPUT", "Answer must be between 1 and 20000 characters.");
    const evaluation = safeParseInterviewEvaluation(event.evaluation);
    if (!evaluation.success) return failure("INVALID_INPUT", evaluation.errors.join(" "));
    return { ok: true, state: advance(state, { slotId: state.currentQuestion.slotId, questionId: state.currentQuestion.questionId, kind: state.currentQuestion.kind, evidenceRevision: state.currentQuestion.evidenceRevision, evaluation: evaluation.data }) };
  }
  if (event.type === "follow_up") {
    if (!event.answer.trim() || event.answer.length > 4_000) return failure("INVALID_INPUT", "Follow-up must be between 1 and 4000 characters.");
    const isCurrent = state.currentQuestion.questionId === event.questionId;
    const isPrevious = state.completedSlots.at(-1)?.questionId === event.questionId;
    if (!isCurrent && !isPrevious) return failure("WRONG_QUESTION", "Follow-ups are limited to the current or immediately previous question.");
    return { ok: true, state: { ...state, followUps: [...state.followUps, { followUpId: event.followUpId, questionId: event.questionId, answer: event.answer, createdAt: event.createdAt }] } };
  }
  if (event.type === "scenario_review") {
    if (state.currentQuestion.kind !== "live_scale") return failure("ILLEGAL_TRANSITION", "Scenario review is only available for live scale slots.");
    if (state.status !== "awaiting_canvas_change" && state.status !== "awaiting_scenario_review") return failure("ILLEGAL_TRANSITION", "The live slot is not ready for review.");
    if (!event.architectureRevision.trim()) return failure("INVALID_INPUT", "Architecture revision is required.");
    if (!event.passed) return { ok: true, state: { ...state, status: "awaiting_canvas_change", activeReviewDigest: undefined } };
    if (!event.reviewDigest?.trim()) return failure("REVIEW_REQUIRED", "A passing simulator review requires a digest.");
    return { ok: true, state: { ...state, status: "awaiting_scenario_critique", activeReviewDigest: event.reviewDigest } };
  }
  if (event.type === "scenario_critique") {
    if (state.currentQuestion.kind !== "live_scale") return failure("ILLEGAL_TRANSITION", "Scenario critique is only available for live scale slots.");
    if (state.status !== "awaiting_scenario_critique" || state.activeReviewDigest !== event.reviewDigest) return failure("REVIEW_STALE", "The current simulator review is stale.");
    if (event.architectureRevision !== state.architectureRevision || !event.critique.trim()) return failure("REVIEW_STALE", "Critique must match the current architecture review.");
    return { ok: true, state: advance({ ...state, architectureRevision: event.architectureRevision }, { slotId: state.currentQuestion.slotId, questionId: state.currentQuestion.questionId, kind: state.currentQuestion.kind, evidenceRevision: state.currentQuestion.evidenceRevision, liveCritique: event.critique }, new Date(0).toISOString()) };
  }
  return failure("ILLEGAL_TRANSITION", "Unsupported v2 interview event.");
}
