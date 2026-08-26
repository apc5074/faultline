import { hashArchitecture } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import {
  validateArchitecture,
  type Architecture,
  type ChallengeDefinition,
  type CostResult,
  type RequirementResult,
} from "@faultline/core";
import {
  evaluateRequirements,
  SIMULATOR_VERSION,
  type SimulationValidationError,
} from "@faultline/simulator";

/**
 * Trusted challenge snapshot already loaded from DB (or an equivalent pin).
 * Callers must not pass client-authored challenge JSON as truth.
 */
export type TrustedChallengeSnapshot = {
  id: string;
  slug: string;
  version: number;
  configHash: string;
  simulatorVersion: string;
  config: ChallengeDefinition;
};

export type VerifiedCompetitionMetrics = {
  p95LatencyMs: number;
  throughputRatio: number;
  headroom: number;
};

export type VerifiedSubmissionSuccess = {
  ok: true;
  architecture: Architecture;
  architectureHash: string;
  challengeVersion: TrustedChallengeSnapshot;
  simulatorVersion: string;
  metrics: VerifiedCompetitionMetrics;
  cost: CostResult;
  requirements: readonly RequirementResult[];
  allRequirementsPass: boolean;
  withinBudget: boolean;
  /** Eligible for ranking / daily_best when requirements + budget both pass. */
  eligible: boolean;
};

export type VerifiedSubmissionFailure = {
  ok: false;
  code: "invalid_architecture" | "simulator_mismatch";
  message: string;
  errors?: readonly SimulationValidationError[];
  challengeVersion?: TrustedChallengeSnapshot;
  simulatorVersion: string;
};

export type VerifySubmissionResult = VerifiedSubmissionSuccess | VerifiedSubmissionFailure;

/**
 * Server competition truth: validate architecture, run shared simulator + cost +
 * requirements against a trusted challenge snapshot. Never accepts client metrics.
 */
export function verifySubmission(input: {
  architecture: unknown;
  challengeVersion: TrustedChallengeSnapshot;
}): VerifySubmissionResult {
  const { challengeVersion } = input;
  const runtimeSimulatorVersion = SIMULATOR_VERSION;

  if (challengeVersion.simulatorVersion !== runtimeSimulatorVersion) {
    return {
      ok: false,
      code: "simulator_mismatch",
      message: `Challenge requires simulator ${challengeVersion.simulatorVersion}; runtime is ${runtimeSimulatorVersion}.`,
      challengeVersion,
      simulatorVersion: runtimeSimulatorVersion,
    };
  }

  const schema = validateArchitecture(input.architecture);
  if (!schema.success) {
    return {
      ok: false,
      code: "invalid_architecture",
      message: "Architecture failed canonical schema validation.",
      errors: schema.errors.map(({ message, path }) => ({
        code: "ARCHITECTURE_SCHEMA_INVALID" as const,
        message: `${path}: ${message}`,
      })),
      challengeVersion,
      simulatorVersion: runtimeSimulatorVersion,
    };
  }

  const architecture = schema.data;
  const outcome = evaluateRequirements({
    architecture,
    challenge: challengeVersion.config,
    registry: componentRegistry,
  });

  if (!outcome.valid) {
    return {
      ok: false,
      code: "invalid_architecture",
      message: "Architecture failed shared simulation validation.",
      errors: outcome.errors,
      challengeVersion,
      simulatorVersion: runtimeSimulatorVersion,
    };
  }

  const withinBudget = outcome.cost.monthlyTotal <= challengeVersion.config.monthlyBudget;
  const allRequirementsPass = outcome.allRequirementsPass;

  return {
    ok: true,
    architecture,
    architectureHash: hashArchitecture(architecture),
    challengeVersion,
    simulatorVersion: runtimeSimulatorVersion,
    metrics: {
      p95LatencyMs: outcome.p95LatencyMs,
      throughputRatio: outcome.throughputRatio,
      headroom: outcome.headroom,
    },
    cost: outcome.cost,
    requirements: outcome.requirements,
    allRequirementsPass,
    withinBudget,
    eligible: allRequirementsPass && withinBudget,
  };
}
