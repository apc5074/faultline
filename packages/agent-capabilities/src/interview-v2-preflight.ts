import type { AgentContext } from "./context.js";
import {
  assessmentFromComponentJustification,
  assessmentFromEdgeCase,
  assessmentFromFailureQuestion,
  assessmentFromRequestPathQuestion,
} from "./interview-assessment.js";
import { buildRequestPathQuestion } from "./interview-q1.js";
import { buildPlayerAddedComponentCards, selectPlayerAddedComponentQuestion, type InterviewQ2ComponentCard } from "./interview-q2.js";
import { buildInterviewScaleQuestion } from "./interview-q3.js";
import { selectInterviewEdgeCase, type InterviewQ4Curriculum } from "./interview-q4.js";
import { buildInterviewFailureQuestion } from "./interview-q5.js";
import { InterviewQuestionContractError } from "./interview-question.js";
import { INTERVIEW_V2_SKIP_LIVE_SCALE, type InterviewV2Question } from "./interview-state-v2.js";
import type { InterviewScenarioCalibration } from "@faultline/core";

export type InterviewV2PreflightInput = {
  readonly context: AgentContext;
  readonly starterComponentIds: readonly string[];
  readonly componentCards: Readonly<Record<string, InterviewQ2ComponentCard>>;
  readonly curriculum: InterviewQ4Curriculum;
  readonly calibration: InterviewScenarioCalibration;
};

export type InterviewV2PreflightResult =
  | { readonly ok: true; readonly questions: readonly InterviewV2Question[] }
  | { readonly ok: false; readonly code: "PREPARATION_REQUIRED"; readonly message: string; readonly preparationAction: string };

function revision(context: AgentContext): string {
  return context.evidenceMeta?.architectureRevision ?? "unversioned";
}

/** Build the active slot agenda or return one friendly preparation action. Never half-starts. */
export function preflightInterviewV2(input: InterviewV2PreflightInput): InterviewV2PreflightResult {
  const evidenceRevision = revision(input.context);
  if (input.calibration.architectureRevision !== evidenceRevision) {
    return { ok: false, code: "PREPARATION_REQUIRED", message: "Live scenario calibration is stale for the current architecture.", preparationAction: "Re-run interview preparation on the current board before starting." };
  }

  const q2Cards = buildPlayerAddedComponentCards({
    context: input.context,
    starterComponentIds: input.starterComponentIds,
    componentCards: input.componentCards,
  });
  if (q2Cards.candidates.length === 0) {
    return { ok: false, code: "PREPARATION_REQUIRED", message: "The interview needs a player-added component on the current request path.", preparationAction: "Add one unlocked component on the request path, then ask to be interviewed again." };
  }

  if (!INTERVIEW_V2_SKIP_LIVE_SCALE) {
    const scaleCandidates = input.calibration.candidates.filter((candidate) => candidate.kind === "scale");
    if (scaleCandidates.length === 0) {
      return { ok: false, code: "PREPARATION_REQUIRED", message: "No safe live scaling scenario is available for this design.", preparationAction: "Keep a scalable service on the path with headroom to change, then retry the interview." };
    }
  }

  const failureCandidates = input.calibration.candidates.filter((candidate) => candidate.kind === "failure");
  if (failureCandidates.length === 0) {
    return { ok: false, code: "PREPARATION_REQUIRED", message: "No safe live failure scenario is available for this design.", preparationAction: "Keep a recoverable service on the request path, then retry the interview." };
  }

  if (input.curriculum.edgeCaseCards.length === 0) {
    return { ok: false, code: "PREPARATION_REQUIRED", message: "This challenge has no authored edge-case interview cards.", preparationAction: "Choose a challenge with interview curriculum, then retry." };
  }

  const q1 = buildRequestPathQuestion(input.context);
  let q2;
  let q4;
  let q5;
  try {
    q2 = selectPlayerAddedComponentQuestion({
      context: input.context,
      starterComponentIds: input.starterComponentIds,
      componentCards: input.componentCards,
    });
    q4 = selectInterviewEdgeCase({ curriculum: input.curriculum, evidenceRevision });
    q5 = buildInterviewFailureQuestion(input.calibration, evidenceRevision, undefined, input.context.architecture);
  } catch (error) {
    const message = error instanceof InterviewQuestionContractError || error instanceof Error
      ? error.message
      : "Interview question preparation failed.";
    return {
      ok: false,
      code: "PREPARATION_REQUIRED",
      message,
      preparationAction: "Adjust the architecture so current path evidence and challenge interview cards can be used, then ask to be interviewed again.",
    };
  }

  const questions: InterviewV2Question[] = [
    {
      kind: "request_path",
      slotId: "request-path-v2",
      questionId: q1.questionId,
      ordinal: 1,
      prompt: q1.prompt,
      evidenceRevision: q1.evidenceRevision,
      assessment: assessmentFromRequestPathQuestion(q1),
    },
    {
      kind: "component_justification",
      slotId: "component-justification-v2",
      questionId: q2.question.cardId,
      ordinal: 2,
      prompt: q2.question.prompt,
      evidenceRevision: q2.question.evidenceRevision,
      assessment: assessmentFromComponentJustification(q2),
    },
  ];

  if (!INTERVIEW_V2_SKIP_LIVE_SCALE) {
    try {
      const q3 = buildInterviewScaleQuestion(input.calibration, evidenceRevision);
      questions.push({
        kind: "live_scale",
        slotId: "live-scale-v2",
        questionId: q3.questionId,
        ordinal: 3,
        prompt: q3.prompt,
        evidenceRevision: q3.evidenceRevision,
        targetComponentId: q3.targetComponentId,
        calibrationId: q3.candidateId,
        coachingObjective: q3.coachingObjective,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Live scale question preparation failed.";
      return {
        ok: false,
        code: "PREPARATION_REQUIRED",
        message,
        preparationAction: "Keep a scalable service on the path with headroom to change, then retry the interview.",
      };
    }
  }

  const edgeOrdinal = INTERVIEW_V2_SKIP_LIVE_SCALE ? 3 : 4;
  const failureOrdinal = INTERVIEW_V2_SKIP_LIVE_SCALE ? 4 : 5;
  questions.push(
    {
      kind: "challenge_edge_case",
      slotId: "challenge-edge-case-v2",
      questionId: q4.questionId,
      ordinal: edgeOrdinal,
      prompt: q4.question.prompt,
      evidenceRevision: q4.question.evidenceRevision,
      assessment: assessmentFromEdgeCase(q4),
    },
    {
      kind: "live_failure",
      slotId: "live-failure-v2",
      questionId: q5.questionId,
      ordinal: failureOrdinal,
      prompt: q5.prompt,
      evidenceRevision: q5.evidenceRevision,
      assessment: assessmentFromFailureQuestion(q5),
      targetComponentId: q5.targetComponentId,
    },
  );

  return { ok: true, questions };
}
