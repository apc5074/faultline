import type {
  Architecture,
  ArchitectureNormalEvidence,
  ArchitectureScenarioComparison,
  ArchitectureScenarioEvidence,
  ExperimentDefinition,
} from "@faultline/core";
import { compareArchitectures, semanticArchitectureRevision, validateArchitecture } from "@faultline/core";
import type { ComponentRegistry } from "@faultline/component-catalog";
import { evaluateExperiment, type ExperimentEvaluationResult } from "./experiment.js";
import { evaluateRequirements } from "./requirements.js";
import { SIMULATOR_VERSION } from "./version.js";

export interface ArchitectureScenarioComparisonInput {
  readonly originalArchitecture: unknown;
  readonly candidateArchitecture: unknown;
  readonly challenge: Parameters<typeof evaluateRequirements>[0]["challenge"];
  readonly registry: ComponentRegistry;
  readonly scenario: unknown;
}

function unavailable(result: Exclude<ExperimentEvaluationResult, { ok: true }>): ArchitectureScenarioEvidence {
  return {
    valid: false,
    code: result.code,
    message: result.message,
    ...(result.details ? { details: result.details } : {}),
  };
}

function normalSummary(input: {
  readonly architecture: unknown;
  readonly challenge: ArchitectureScenarioComparisonInput["challenge"];
  readonly registry: ComponentRegistry;
}): ArchitectureNormalEvidence {
  const result = evaluateRequirements(input);
  if (!result.valid) {
    return { valid: false, code: "INVALID_INPUT", message: "Architecture or challenge is invalid for simulation.", details: result.errors.map((error) => error.message) };
  }
  return {
    valid: true,
    allRequirementsPass: result.allRequirementsPass,
    requirements: result.requirements,
    p95LatencyMs: result.p95LatencyMs,
    throughputRatio: result.throughputRatio,
    headroom: result.headroom,
    cost: result.cost,
    hotKey: { active: result.hotKey.active, passed: result.hotKey.passed, viralRedirectRps: result.hotKey.viralRedirectRps },
  };
}

function parseForRevision(input: unknown): Architecture | undefined {
  const result = validateArchitecture(input);
  return result.success ? result.data : undefined;
}

function scenarioMetricDelta(
  original: ArchitectureScenarioEvidence,
  candidate: ArchitectureScenarioEvidence,
): ArchitectureScenarioComparison["scenarioMetricDelta"] {
  if (!("outcome" in original) || !original.outcome.valid || !("outcome" in candidate) || !candidate.outcome.valid) return null;
  return {
    p95LatencyMs: candidate.outcome.p95LatencyMs - original.outcome.p95LatencyMs,
    throughputRatio: candidate.outcome.throughputRatio - original.outcome.throughputRatio,
    headroom: candidate.outcome.headroom - original.outcome.headroom,
    costMonthlyTotal: candidate.outcome.cost.monthlyTotal - original.outcome.cost.monthlyTotal,
  };
}

function scenarioRequirementDelta(
  original: ArchitectureScenarioEvidence,
  candidate: ArchitectureScenarioEvidence,
): ArchitectureScenarioComparison["scenarioRequirementDelta"] {
  if (!("outcome" in original) || !original.outcome.valid || !("outcome" in candidate) || !candidate.outcome.valid) return null;
  const originalRequirements = new Map(original.outcome.requirements.map((requirement) => [requirement.id, requirement]));
  const candidateRequirements = new Map(candidate.outcome.requirements.map((requirement) => [requirement.id, requirement]));
  const changed = [...new Set([...originalRequirements.keys(), ...candidateRequirements.keys()])].sort().flatMap((id) => {
    const before = originalRequirements.get(id);
    const after = candidateRequirements.get(id);
    if (!before || !after || (before.passed === after.passed && before.actual === after.actual)) return [];
    return [{ id, baselinePassed: before.passed, outcomePassed: after.passed, actualDelta: after.actual - before.actual }];
  });
  return {
    newlyFailed: changed.filter((item) => item.baselinePassed && !item.outcomePassed).map((item) => item.id),
    newlyPassed: changed.filter((item) => !item.baselinePassed && item.outcomePassed).map((item) => item.id),
    changed,
  };
}

/** Compare one original and one edited architecture under a fixed scenario. */
export function compareArchitectureScenario(input: ArchitectureScenarioComparisonInput): ArchitectureScenarioComparison {
  const scenarioResult = evaluateExperiment({ architecture: input.originalArchitecture, challenge: input.challenge, registry: input.registry, experiment: input.scenario });
  const candidateScenarioResult = evaluateExperiment({ architecture: input.candidateArchitecture, challenge: input.challenge, registry: input.registry, experiment: input.scenario });
  const original = parseForRevision(input.originalArchitecture);
  const candidate = parseForRevision(input.candidateArchitecture);
  const originalRevision = original ? semanticArchitectureRevision(original) : "invalid";
  const candidateRevision = candidate ? semanticArchitectureRevision(candidate) : "invalid";
  const originalScenario = scenarioResult.ok ? scenarioResult.data : unavailable(scenarioResult);
  const candidateScenario = candidateScenarioResult.ok ? candidateScenarioResult.data : unavailable(candidateScenarioResult);
  const candidateNormal = candidate ? normalSummary({ architecture: candidate, challenge: input.challenge, registry: input.registry }) : {
    valid: false as const,
    code: "INVALID_INPUT",
    message: "Candidate architecture is structurally invalid for simulation.",
  };
  return {
    scenario: input.scenario as ExperimentDefinition,
    originalArchitectureRevision: originalRevision,
    candidateArchitectureRevision: candidateRevision,
    architectureDelta: original && candidate ? compareArchitectures(original, candidate) : {
      componentsAdded: [], componentsRemoved: [], connectionsAdded: [], connectionsRemoved: [], configChanges: [], deploymentsAdded: [], deploymentsRemoved: [], deploymentChanges: [],
    },
    originalScenario,
    candidateNormal,
    candidateScenario,
    scenarioMetricDelta: scenarioMetricDelta(originalScenario, candidateScenario),
    scenarioRequirementDelta: scenarioRequirementDelta(originalScenario, candidateScenario),
    simulatorVersion: SIMULATOR_VERSION,
  };
}
