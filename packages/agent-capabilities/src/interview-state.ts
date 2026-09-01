/**
 * Adapter-neutral state machine for a sequential design interview.
 *
 * This module deliberately contains no model, browser, database, or framework
 * code. Hosts provide evaluated answer content and use the reducer to enforce
 * question ordering and legal transitions.
 */

export type InterviewPhase = "opening" | "component" | "complete";

export type InterviewStatus =
  | "awaiting_answer"
  | "awaiting_follow_up_or_next"
  | "completed"
  | "stale"
  | "abandoned";

export type InterviewVerdict = "correct" | "partial" | "incorrect";

export type InterviewQuestion = {
  readonly questionId: string;
  readonly ordinal: number;
  readonly phase: "opening" | "component";
  readonly prompt: string;
  readonly componentIds: readonly string[];
  readonly grouped: boolean;
  /** Model-facing focus; the external host writes the final question wording. */
  readonly focus?: string;
  readonly contextSignals?: readonly string[];
};

export type InterviewEvaluation = {
  readonly verdict: InterviewVerdict;
  readonly explanation: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly idealAnswer: string;
  readonly confidence?: "high" | "medium" | "low";
};

export type InterviewAnswer = InterviewEvaluation & {
  readonly answerId: string;
  readonly questionId: string;
  readonly answer: string;
  readonly createdAt: string;
};

export type InterviewFollowUp = {
  readonly followUpId: string;
  readonly questionId: string;
  readonly question: string;
  readonly answer: string;
  readonly createdAt: string;
};

export type InterviewState = {
  readonly interviewId: string;
  readonly architectureRevision: string;
  readonly challengeId?: string;
  readonly questions: readonly InterviewQuestion[];
  readonly phase: InterviewPhase;
  readonly status: InterviewStatus;
  readonly currentQuestion: InterviewQuestion | null;
  readonly questionOrdinal: number;
  readonly totalQuestions: number;
  readonly answers: readonly InterviewAnswer[];
  readonly followUps: readonly InterviewFollowUp[];
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly staleAt?: string;
};

export type InterviewStartEvent = {
  readonly type: "start";
  readonly interviewId: string;
  readonly architectureRevision: string;
  readonly challengeId?: string;
  readonly questions: readonly InterviewQuestion[];
  readonly startedAt: string;
};

export type InterviewAnswerEvent = {
  readonly type: "answer";
  readonly questionId: string;
  readonly answerId: string;
  readonly answer: string;
  readonly evaluation: InterviewEvaluation;
  readonly createdAt: string;
};

export type InterviewFollowUpEvent = {
  readonly type: "follow_up";
  readonly questionId: string;
  readonly followUpId: string;
  readonly question: string;
  readonly answer: string;
  readonly createdAt: string;
};

export type InterviewAdvanceEvent = {
  readonly type: "advance";
  readonly questionId: string;
  /** The host must only set this after an explicit player readiness signal. */
  readonly ready: true;
  readonly advancedAt: string;
};

export type InterviewStaleEvent = {
  readonly type: "stale";
  readonly staleAt: string;
};

export type InterviewAbandonEvent = {
  readonly type: "abandon";
};

export type InterviewEvent =
  | InterviewStartEvent
  | InterviewAnswerEvent
  | InterviewFollowUpEvent
  | InterviewAdvanceEvent
  | InterviewStaleEvent
  | InterviewAbandonEvent;

export type InterviewTransitionErrorCode =
  | "INTERVIEW_ALREADY_STARTED"
  | "INTERVIEW_NOT_STARTED"
  | "INTERVIEW_COMPLETE"
  | "INTERVIEW_STALE"
  | "INTERVIEW_ABANDONED"
  | "INVALID_QUESTION"
  | "WRONG_QUESTION"
  | "ANSWER_REQUIRED"
  | "NOT_READY"
  | "INVALID_INPUT";

export type InterviewTransitionError = {
  readonly ok: false;
  readonly code: InterviewTransitionErrorCode;
  readonly message: string;
};

export type InterviewTransitionResult =
  | { readonly ok: true; readonly state: InterviewState }
  | InterviewTransitionError;

const MAX_QUESTIONS = 100;
const MAX_ANSWER_LENGTH = 20_000;
const MAX_FOLLOW_UP_LENGTH = 4_000;

function error(code: InterviewTransitionErrorCode, message: string): InterviewTransitionError {
  return { ok: false, code, message };
}

function validQuestions(questions: readonly InterviewQuestion[]): boolean {
  if (questions.length === 0 || questions.length > MAX_QUESTIONS) return false;
  return questions.every(
    (question, index) =>
      question.questionId.trim().length > 0 &&
      question.ordinal === index + 1 &&
      question.prompt.trim().length > 0 &&
      question.componentIds.every((componentId) => componentId.trim().length > 0),
  );
}

function questionFor(state: InterviewState, questionId: string): InterviewQuestion | undefined {
  return state.questions.find((question) => question.questionId === questionId);
}

function currentAnswer(state: InterviewState): InterviewAnswer | undefined {
  if (!state.currentQuestion) return undefined;
  for (let index = state.answers.length - 1; index >= 0; index -= 1) {
    const answer = state.answers[index]!;
    if (answer.questionId === state.currentQuestion.questionId) return answer;
  }
  return undefined;
}

function assertActive(state: InterviewState): InterviewTransitionError | null {
  if (!state.currentQuestion || state.status === "awaiting_answer" || state.status === "awaiting_follow_up_or_next") {
    return null;
  }
  if (state.status === "completed") return error("INTERVIEW_COMPLETE", "The design interview is complete.");
  if (state.status === "stale") return error("INTERVIEW_STALE", "The architecture changed; restart the interview on the current design.");
  return error("INTERVIEW_ABANDONED", "The design interview was abandoned.");
}

export function createInterviewState(event: InterviewStartEvent): InterviewTransitionResult {
  if (event.interviewId.trim().length === 0 || event.architectureRevision.trim().length === 0) {
    return error("INVALID_INPUT", "Interview ID and architecture revision are required.");
  }
  if (!validQuestions(event.questions)) {
    return error("INVALID_INPUT", "Questions must be non-empty, ordered, unique, and bounded.");
  }
  if (event.questions.some((question, index) => event.questions.findIndex((candidate) => candidate.questionId === question.questionId) !== index)) {
    return error("INVALID_INPUT", "Question IDs must be unique.");
  }
  const currentQuestion = event.questions[0]!;
  return {
    ok: true,
    state: {
      interviewId: event.interviewId,
      architectureRevision: event.architectureRevision,
      ...(event.challengeId !== undefined ? { challengeId: event.challengeId } : {}),
      questions: event.questions,
      phase: currentQuestion.phase,
      status: "awaiting_answer",
      currentQuestion,
      questionOrdinal: currentQuestion.ordinal,
      totalQuestions: event.questions.length,
      answers: [],
      followUps: [],
      startedAt: event.startedAt,
    },
  };
}

export function transitionInterview(state: InterviewState, event: InterviewEvent): InterviewTransitionResult {
  if (event.type === "start") return error("INTERVIEW_ALREADY_STARTED", "This interview has already started.");

  const activeError = assertActive(state);
  if (activeError && event.type !== "abandon" && event.type !== "stale") return activeError;

  if (event.type === "stale") {
    if (state.status === "completed") return error("INTERVIEW_COMPLETE", "A completed interview cannot become stale.");
    if (state.status === "abandoned") return error("INTERVIEW_ABANDONED", "The design interview was abandoned.");
    return { ok: true, state: { ...state, status: "stale", staleAt: event.staleAt } };
  }

  if (event.type === "abandon") {
    if (state.status === "completed") return error("INTERVIEW_COMPLETE", "A completed interview cannot be abandoned.");
    if (state.status === "abandoned") return { ok: true, state };
    return { ok: true, state: { ...state, status: "abandoned" } };
  }

  if (!state.currentQuestion) return error("INTERVIEW_NOT_STARTED", "The interview has no current question.");
  if (event.questionId !== state.currentQuestion.questionId) {
    return error("WRONG_QUESTION", `Expected question "${state.currentQuestion.questionId}".`);
  }

  if (event.type === "answer") {
    if (event.answer.trim().length === 0 || event.answer.length > MAX_ANSWER_LENGTH) {
      return error("INVALID_INPUT", `Answer must be between 1 and ${MAX_ANSWER_LENGTH} characters.`);
    }
    const answer: InterviewAnswer = {
      ...event.evaluation,
      answerId: event.answerId,
      questionId: event.questionId,
      answer: event.answer,
      createdAt: event.createdAt,
    };
    return {
      ok: true,
      state: { ...state, status: "awaiting_follow_up_or_next", answers: [...state.answers, answer] },
    };
  }

  if (event.type === "follow_up") {
    if (event.question.trim().length === 0 || event.question.length > MAX_FOLLOW_UP_LENGTH) {
      return error("INVALID_INPUT", `Follow-up question must be between 1 and ${MAX_FOLLOW_UP_LENGTH} characters.`);
    }
    if (event.answer.trim().length === 0 || event.answer.length > MAX_ANSWER_LENGTH) {
      return error("INVALID_INPUT", `Follow-up answer must be between 1 and ${MAX_ANSWER_LENGTH} characters.`);
    }
    if (!currentAnswer(state)) return error("ANSWER_REQUIRED", "Submit an answer before asking a follow-up.");
    const followUp: InterviewFollowUp = {
      followUpId: event.followUpId,
      questionId: event.questionId,
      question: event.question,
      answer: event.answer,
      createdAt: event.createdAt,
    };
    return { ok: true, state: { ...state, followUps: [...state.followUps, followUp] } };
  }

  if (event.type === "advance") {
    if (event.ready !== true) return error("NOT_READY", "Explicit readiness is required before advancing.");
    if (!currentAnswer(state)) return error("ANSWER_REQUIRED", "Submit an answer before advancing.");
    const nextQuestion = state.questions[state.questionOrdinal];
    if (!nextQuestion) {
      return {
        ok: true,
        state: {
          ...state,
          phase: "complete",
          status: "completed",
          currentQuestion: null,
          completedAt: event.advancedAt,
        },
      };
    }
    return {
      ok: true,
      state: {
        ...state,
        phase: nextQuestion.phase,
        status: "awaiting_answer",
        currentQuestion: nextQuestion,
        questionOrdinal: nextQuestion.ordinal,
      },
    };
  }

  return error("INVALID_INPUT", "Unsupported interview event.");
}
