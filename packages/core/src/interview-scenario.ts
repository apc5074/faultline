import type { Architecture } from "./architecture.js";
import type { ChallengeDefinition } from "./challenge.js";

export type InterviewScenarioKind = "scale" | "failure";
export type InterviewScenarioFailureScope = "component" | "region";

/** Serializable, challenge-neutral description of one live interview scenario. */
export interface InterviewScenarioCandidate {
  readonly candidateId: string;
  readonly kind: InterviewScenarioKind;
  readonly targetComponentId: string;
  /** Registry-owned config path whose change can affect this scenario. */
  readonly targetConfigPath?: string;
  readonly failureScope?: InterviewScenarioFailureScope;
  /** Challenge-relative traffic multiplier that saturates before the scale edit and recovers after. */
  readonly trafficMultiplier?: number;
  readonly primaryReason: string;
  readonly coachingObjective: string;
  readonly recoveryEditClasses: readonly string[];
  readonly earlyCareerEditCap: number;
}

export interface InterviewScenarioWitness {
  readonly candidateId: string;
  readonly passingConfigPath?: string;
  readonly passingValue?: number | string;
  readonly hidden: true;
}

export interface InterviewScenarioCalibration {
  readonly architectureRevision: string;
  readonly simulatorVersion: string;
  readonly candidates: readonly InterviewScenarioCandidate[];
  readonly witnesses: readonly InterviewScenarioWitness[];
}

/** Input for deterministic calibration; the evaluator remains simulator-owned. */
export interface InterviewScenarioCalibrationInput {
  readonly architecture: Architecture;
  readonly challenge: ChallengeDefinition;
  readonly architectureRevision: string;
  readonly simulatorVersion: string;
}
