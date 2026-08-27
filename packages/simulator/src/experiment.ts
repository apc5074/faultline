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
import { definitionToOverlay, isValidRegion, validateExperimentDefinition } from "@faultline/core";

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

function challengeWithOverlay(
  challenge: ChallengeDefinition,
  overlay: ExperimentOverlay | undefined,
): ChallengeDefinition {
  const multiplier = overlay?.trafficMultiplier;
  const hotKeyReadFraction = overlay?.hotKeyReadFraction;
  if (multiplier === undefined && hotKeyReadFraction === undefined) return challenge;

  // Workload consumers (traffic, geography, cache, hot-key, transfer cost, and
  // requirement evaluation) all derive from this one immutable challenge copy.
  return {
    ...challenge,
    workload: {
      ...challenge.workload,
      ...(multiplier !== undefined
        ? { requestsPerSecond: challenge.workload.requestsPerSecond * multiplier }
        : {}),
      ...(hotKeyReadFraction !== undefined ? { hotKeyReadFraction } : {}),
    },
  };
}

function evaluateSimulation(
  input: TrafficPropagationInput,
  overlay?: ExperimentOverlay,
): RequirementsEvaluationResult {
  return evaluateRequirements({
    ...input,
    challenge: challengeWithOverlay(input.challenge, overlay),
    ...(overlay ? { overlay } : {}),
  });
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
  if (definition.type === "hot_key") {
    const baselineFraction = input.challenge.workload.hotKeyReadFraction ?? 0;
    if (definition.parameters.hotKeyReadFraction <= baselineFraction) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "hot_key hotKeyReadFraction must exceed the challenge baseline fraction.",
      };
    }
  }
  if (definition.type === "region_failure" && !isValidRegion(definition.parameters.regionId)) {
    return { ok: false, code: "UNSUPPORTED_TARGET", message: "region_failure target must be a known region." };
  }
  const overlay = definitionToOverlay(definition);
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
  if (definition.type === "region_failure") {
    const serviceRegions = new Set(
      (input.architecture as { components?: Array<{ type?: string; deployments?: Array<{ regionId?: string }> }> }).components
        ?.filter((component) => component.type === "service")
        .flatMap((component) => component.deployments?.map((deployment) => deployment.regionId) ?? [])
        .filter((regionId): regionId is string => isValidRegion(regionId)) ?? [],
    );
    if (
      !baselineResult.regionalWorkload.active ||
      serviceRegions.size < 2 ||
      !serviceRegions.has(definition.parameters.regionId) ||
      [...serviceRegions].every((regionId) => regionId === definition.parameters.regionId)
    ) {
      return {
        ok: false,
        code: "UNAVAILABLE_EXPERIMENT",
        message: "region_failure requires active geography, multi-region Service deployments including the target region, and a healthy alternate region.",
      };
    }
  }
  if (definition.type === "cache_flush" && !baselineResult.caches[definition.parameters.componentId]) {
    return {
      ok: false,
      code: "UNSUPPORTED_TARGET",
      message: "cache_flush target must be an existing CDN or Redis component on a simulated request path.",
    };
  }
  if (definition.type === "component_failure" && !baselineResult.services[definition.parameters.componentId]) {
    return {
      ok: false,
      code: "UNSUPPORTED_TARGET",
      message: "component_failure target must be an existing Service component on a simulated request path.",
    };
  }
  const outcomeResult = evaluateSimulation(propagationInput, overlay);
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
      events: [
        {
          type: "experiment_started",
          data: { experimentType: definition.type },
        },
        ...(definition.type === "traffic_multiplier"
          ? [{
              type: "traffic_multiplier_applied",
              data: { multiplier: definition.parameters.multiplier },
            }]
          : []),
        ...(definition.type === "hot_key"
          ? [{
              type: "hot_key_pattern_applied",
              data: {
                hotKeyReadFraction: definition.parameters.hotKeyReadFraction,
                viralRedirectRps: outcome.hotKey.viralRedirectRps,
              },
            }]
          : []),
        ...(definition.type === "cache_flush"
          ? [{
              type: "cache_flushed",
              componentId: definition.parameters.componentId,
              data: { observation: "cold_cache", configuredHitRate: 0 },
            }]
          : []),
        ...(definition.type === "component_failure"
          ? [{ type: "component_failed", componentId: definition.parameters.componentId, data: { simulated: "true" } }]
          : []),
        ...(definition.type === "region_failure"
          ? [{ type: "region_failed", data: { regionId: definition.parameters.regionId, simulated: "true" } }]
          : []),
        ...(definition.type === "region_failure" && baselineResult.geographicRoutes.some((baselineRoute) =>
          baselineRoute.kind === "request" &&
          baselineRoute.destinationRegion === definition.parameters.regionId &&
          outcomeResult.geographicRoutes.some((outcomeRoute) =>
            outcomeRoute.kind === "request" &&
            outcomeRoute.originRegion === baselineRoute.originRegion &&
            outcomeRoute.destinationRegion !== definition.parameters.regionId,
          ),
        )
          ? [{ type: "traffic_rerouted", data: { failedRegion: definition.parameters.regionId, simulated: "true" } }]
          : []),
        ...outcomeResult.events.map(toExperimentEvent),
        ...(outcomeResult.unroutableRps > 0
          ? [{
              type: "unroutable_demand",
              data: { requestsPerSecond: outcomeResult.unroutableRps },
            }]
          : []),
        ...(definition.type === "region_failure" && outcomeResult.events.some((event) =>
          event.data.reason === "database_unavailable",
        )
          ? [{ type: "database_unavailable", data: { failedRegion: definition.parameters.regionId, simulated: "true" } }]
          : []),
        {
          type: "experiment_completed",
          data: { experimentType: definition.type },
        },
      ],
      simulatorVersion: SIMULATOR_VERSION,
    },
  };
}
