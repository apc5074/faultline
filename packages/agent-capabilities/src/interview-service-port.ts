import type { ArchitectureScenarioComparison } from "@faultline/core";
import type { AgentContext } from "./context.js";
import type { InterviewEvaluation, InterviewSimulationCritique, InterviewState } from "./interview-state.js";
import type { PresentationCue } from "./presentation-cue.js";

export type InterviewServiceSnapshot = {
  readonly state: InterviewState;
  readonly question: InterviewState["currentQuestion"];
  readonly presentationCue?: PresentationCue;
  readonly storageRevision: number;
  readonly simulationReview?: InterviewSimulationReviewPacket;
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
