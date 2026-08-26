import type { ComponentRegistry } from "@faultline/component-catalog";
import type {
  ChallengeDefinition,
  ExperimentDelta,
  ExperimentErrorCode,
  ExperimentEvent,
  ExperimentOverlay,
  ExperimentResult,
  ExperimentSummary,
  RequirementResult,
} from "@faultline/core";
import { validateExperimentDefinition } from "@faultline/core";

import { evaluateRequirements, type RequirementsEvaluationResult } from "./requirements.js";
import type { SimulationEvent, TrafficPropagationInput } from "./traffic.js";
import { SIMULATOR_VERSION } from "./version.js";

export interface ExperimentEvaluationInput {
  architecture: unknown;
  challenge: ChallengeDefinition;
  registry: ComponentRegistry;
  experiment: unknown;
}

export interface ExperimentEvaluationError {
  ok: false;
  code: ExperimentErrorCode;
  message: string;
  details?: readonly string[];
}

export type ExperimentEvaluationResult =
  | { ok: true; data: ExperimentResult }
  | ExperimentEvaluationError;

function toExperimentEvent(event: SimulationEvent): ExperimentEvent {
  return {
    type: event.type,
    ...(event.connectionId !== undefined ? { connectionId: event.connectionId } : {}),
    ...(event.componentId !== undefined ? { componentId: event.componentId } : {}),
    data: event.data,
  };
}

function toExperimentSummary(result: RequirementsEvaluationResult): ExperimentSummary {
  if (!result.valid) {
    return {
      valid: false,
      allRequirementsPass: false,
      requirements: [],
      p95LatencyMs: 0,
      throughputRatio: 0,
      headroom: 0,
      cost: { monthlyTotal: 0, lineItems: [] },
      hotKey: { active: false, passed: true, viralRedirectRps: 0 },
    };
  }

  return {
    valid: true,
    allRequirementsPass: result.allRequirementsPass,
    requirements: result.requirements,
    p95LatencyMs: result.p95LatencyMs,
    throughputRatio: result.throughputRatio,
    headroom: result.headroom,
    cost: result.cost,
    hotKey: {
      active: result.hotKey.active,
      passed: result.hotKey.passed,
      viralRedirectRps: result.hotKey.viralRedirectRps,
    },
  };
}

function requirementById(
  requirements: readonly RequirementResult[],
  id: string,
): RequirementResult | undefined {
  return requirements.find((requirement) => requirement.id === id);
}

function computeDelta(baseline: ExperimentSummary, outcome: ExperimentSummary): ExperimentDelta {
  const metrics: ExperimentDelta["metrics"] = {};
  const newlyFailed: string[] = [];
  const newlyPassed: string[] = [];
  const changed: ExperimentDelta["requirements"]["changed"][number][] = [];

  if (!baseline.valid || !outcome.valid) {
    return {
      metrics,
      requirements: { newlyFailed, newlyPassed, changed },
    };
  }

  if (baseline.p95LatencyMs !== outcome.p95LatencyMs) {
    metrics.p95LatencyMs = outcome.p95LatencyMs - baseline.p95LatencyMs;
  }
  if (baseline.throughputRatio !== outcome.throughputRatio) {
    metrics.throughputRatio = outcome.throughputRatio - baseline.throughputRatio;
  }
  if (baseline.headroom !== outcome.headroom) {
    metrics.headroom = outcome.headroom - baseline.headroom;
  }
  if (baseline.cost.monthlyTotal !== outcome.cost.monthlyTotal) {
    metrics.costMonthlyTotal = outcome.cost.monthlyTotal - baseline.cost.monthlyTotal;
  }

  const requirementIds = new Set([
    ...baseline.requirements.map((requirement) => requirement.id),
    ...outcome.requirements.map((requirement) => requirement.id),
  ]);

  for (const id of [...requirementIds].sort()) {
    const baselineRequirement = requirementById(baseline.requirements, id);
    const outcomeRequirement = requirementById(outcome.requirements, id);
    if (!baselineRequirement || !outcomeRequirement) continue;

    if (baselineRequirement.passed !== outcomeRequirement.passed) {
      if (baselineRequirement.passed && !outcomeRequirement.passed) {
        newlyFailed.push(id);
      } else if (!baselineRequirement.passed && outcomeRequirement.passed) {
        newlyPassed.push(id);
      }
    }

    if (
      baselineRequirement.passed !== outcomeRequirement.passed ||
      baselineRequirement.actual !== outcomeRequirement.actual
    ) {
      changed.push({
        id,
        baselinePassed: baselineRequirement.passed,
        outcomePassed: outcomeRequirement.passed,
        actualDelta: outcomeRequirement.actual - baselineRequirement.actual,
      });
    }
  }

  const delta: ExperimentDelta = {
    metrics,
    requirements: { newlyFailed, newlyPassed, changed },
  };

  if (
    baseline.hotKey.active !== outcome.hotKey.active ||
    baseline.hotKey.passed !== outcome.hotKey.passed ||
    baseline.hotKey.viralRedirectRps !== outcome.hotKey.viralRedirectRps
  ) {
    delta.hotKey = {
      passedChanged: baseline.hotKey.passed !== outcome.hotKey.passed,
      viralRedirectRpsDelta: outcome.hotKey.viralRedirectRps - baseline.hotKey.viralRedirectRps,
    };
  }

  return delta;
}

function evaluateSimulation(input: TrafficPropagationInput, _overlay?: ExperimentOverlay): RequirementsEvaluationResult {
  // EXP-001: overlay threading lands in EXP-002–EXP-006. Baseline path is unchanged.
  return evaluateRequirements(input);
}

/**
 * Evaluates one deterministic experiment: baseline plus a single typed overlay.
 * Does not mutate Architecture, ChallengeDefinition, or catalog config.
 */
export function evaluateExperiment(input: ExperimentEvaluationInput): ExperimentEvaluationResult {
  const definitionResult = validateExperimentDefinition(input.experiment);
  if (!definitionResult.success) {
    const first = definitionResult.errors[0];
    return {
      ok: false,
      code: first?.code ?? "INVALID_INPUT",
      message: first?.message ?? "Invalid experiment definition.",
      details: definitionResult.errors.map((error) =>
        error.path ? `${error.path}: ${error.message}` : error.message,
      ),
    };
  }

  const definition = definitionResult.data;
  const propagationInput: TrafficPropagationInput = {
    architecture: input.architecture,
    challenge: input.challenge,
    registry: input.registry,
  };

  const baselineResult = evaluateSimulation(propagationInput);
  if (!baselineResult.valid) {
    return {
      ok: false,
      code: "INVALID_BASELINE",
      message: "Architecture or challenge baseline is invalid for simulation.",
      details: baselineResult.errors.map((error) => error.message),
    };
  }

  const baseline = toExperimentSummary(baselineResult);
  const outcomeResult = evaluateSimulation(propagationInput);
  if (!outcomeResult.valid) {
    return {
      ok: false,
      code: "INVALID_BASELINE",
      message: "Overlay evaluation failed against the current baseline.",
      details: outcomeResult.errors.map((error) => error.message),
    };
  }

  const outcome = toExperimentSummary(outcomeResult);
  const delta = computeDelta(baseline, outcome);

  return {
    ok: true,
    data: {
      type: definition.type,
      parameters: definition.parameters,
      simulated: true,
      baseline,
      outcome,
      delta,
      events: outcomeResult.events.map(toExperimentEvent),
      simulatorVersion: SIMULATOR_VERSION,
    },
  };
}
