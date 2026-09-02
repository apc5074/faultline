import type { ArchitectureScenarioComparison } from "@faultline/core";
import type { AgentContext } from "./context.js";
import type { InterviewChatAssessment } from "./interview-assessment.js";
import type { InterviewEvaluation, InterviewSimulationCritique, InterviewState } from "./interview-state.js";
import type { InterviewFailureReview } from "./interview-q5.js";
import type { InterviewScaleReview } from "./interview-q3.js";
import type { PresentationCue } from "./presentation-cue.js";
import { capabilityError, type CapabilityResult } from "./result.js";

const INTERVIEW_HOST_ERROR_CODES = new Set([
  "NO_INTERVIEW",
  "STALE_ARCHITECTURE",
  "INVALID_INPUT",
  "PREPARATION_REQUIRED",
  "STORAGE_UNAVAILABLE",
]);

function hostErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Map host-thrown interview errors into controlled capability results (never generic "failed unexpectedly"). */
export function interviewHostCapabilityError(error: unknown): CapabilityResult<never> {
  const code = hostErrorCode(error);
  if (error instanceof Error && code && INTERVIEW_HOST_ERROR_CODES.has(code)) {
    const message = error.message.trim() || "Interview operation failed.";
    if (code === "NO_INTERVIEW" || code === "STORAGE_UNAVAILABLE") {
      return capabilityError("NOT_FOUND", message, { retryable: true, recoveryTool: "start_design_interview" });
    }
    if (code === "STALE_ARCHITECTURE") {
      return capabilityError("INVALID_INPUT", message, { retryable: true, recoveryTool: "restart_design_interview" });
    }
    if (code === "PREPARATION_REQUIRED") {
      return capabilityError("INVALID_INPUT", message, { retryable: true, recoveryTool: "start_design_interview" });
    }
    return capabilityError("INVALID_INPUT", message);
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return capabilityError("INVALID_INPUT", error.message);
  }
  return capabilityError("INVALID_INPUT", "Interview operation failed.");
}

export type InterviewLiveReviewPacket =
  | { readonly kind: "scale"; readonly review: InterviewScaleReview }
  | { readonly kind: "failure"; readonly review: InterviewFailureReview };

export type InterviewServiceSnapshot = {
  readonly state: InterviewState;
  readonly question: InterviewState["currentQuestion"];
  /** Structured rubric/evidence for the current chat question when available. */
  readonly assessment?: InterviewChatAssessment;
  readonly presentationCue?: PresentationCue;
  readonly storageRevision: number;
  readonly simulationReview?: InterviewSimulationReviewPacket;
  /** Digest-bound Q3/Q5 review evidence for the five-slot interview. */
  readonly liveReview?: InterviewLiveReviewPacket;
};

export type InterviewSimulationReviewPacket = {
  readonly questionId: string;
  readonly reviewDigest: string;
  readonly comparison: ArchitectureScenarioComparison;
  readonly generatedAt: string;
  readonly official: false;
  readonly simulated: true;
  readonly architectureChangedByAgent: false;
};

/** Host-owned session port for interview state; contains no adapter imports. */
export interface InterviewService {
  start(context: AgentContext): InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>;
  restart(context: AgentContext): InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>;
  get(context: AgentContext): InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>;
  submitAnswer(context: AgentContext, input: { readonly questionId: string; readonly answerId?: string; readonly answer: string; readonly evaluation: InterviewEvaluation }): InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>;
  followUp(context: AgentContext, input: { readonly questionId: string; readonly followUpId?: string; readonly question: string; readonly answer: string }): InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>;
  advance(context: AgentContext, input: { readonly questionId: string; readonly ready: true }): InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>;
  end(context: AgentContext): InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>;
  clear?(): void | Promise<void>;
  syncArchitecture?(context: AgentContext): InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>;
  prepareSimulationReview?(context: AgentContext, input: { readonly interviewId: string; readonly questionId: string }): InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>;
  submitSimulationCritique?(context: AgentContext, input: { readonly interviewId: string; readonly questionId: string; readonly reviewDigest: string; readonly candidateArchitectureRevision: string; readonly critique: InterviewSimulationCritique }): InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>;
  subscribe?(listener: (snapshot: InterviewServiceSnapshot) => void): () => void;
}
