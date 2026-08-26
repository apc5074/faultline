import type {
  Architecture,
  ChallengeDefinition,
  CostResult,
  RequirementComparator,
  RequirementDefinition,
  RequirementResult,
  RequirementType,
} from "@faultline/core";

import { estimateMonthlyCost } from "./cost.js";
import { evaluatePathLatency } from "./latency.js";
import type { PostgresCapacityMetrics } from "./postgres-capacity.js";
import type { ServiceCapacityMetrics } from "./service-capacity.js";
import type {
  SimulationEvent,
  TrafficPropagationInput,
  TrafficPropagationResult,
} from "./traffic.js";

export type RequirementsEvaluationResult =
  | (Extract<TrafficPropagationResult, { valid: true }> & {
      services: Readonly<Record<string, ServiceCapacityMetrics>>;
      postgres: Readonly<Record<string, PostgresCapacityMetrics>>;
      requirements: readonly RequirementResult[];
      allRequirementsPass: boolean;
      p95LatencyMs: number;
      cost: CostResult;
      throughputRatio: number;
      headroom: number;
    })
  | Extract<TrafficPropagationResult, { valid: false }>;

interface OutcomeSnapshot {
  throughputRatio: number;
  throughputExplanationFocus: string;
  p95LatencyMs: number;
  headroom: number;
  headroomExplanationFocus: string;
  cost: CostResult;
}

function compare(actual: number, comparator: RequirementComparator, target: number): boolean {
  if (comparator === "gte") return actual >= target;
  if (comparator === "lte") return actual <= target;
  return actual < target;
}

function formatRatioPercent(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`;
}

function handledShare(handled: number, demand: number): number {
  if (demand <= 0) return 1;
  return handled / demand;
}

function throughputFromCapacity(
  services: Readonly<Record<string, ServiceCapacityMetrics>>,
  postgres: Readonly<Record<string, PostgresCapacityMetrics>>,
): { ratio: number; focus: string } {
  let ratio = 1;
  let focus = "All services and databases handle the required workload.";

  for (const [componentId, metrics] of Object.entries(services)) {
    const share = handledShare(metrics.handledRps, metrics.incomingRps);
    if (share < ratio) {
      ratio = share;
      focus = `Service "${componentId}" handled ${metrics.handledRps.toLocaleString("en-US")} of ${metrics.incomingRps.toLocaleString("en-US")} requests/sec`;
    }
  }

  for (const [componentId, metrics] of Object.entries(postgres)) {
    const readShare = handledShare(metrics.readHandledRps, metrics.readRps);
    const writeShare = handledShare(metrics.writeHandledRps, metrics.writeRps);
    const share = Math.min(readShare, writeShare);
    if (share < ratio) {
      ratio = share;
      if (readShare <= writeShare) {
        focus = `Postgres "${componentId}" handled ${metrics.readHandledRps.toLocaleString("en-US")} of ${metrics.readRps.toLocaleString("en-US")} read requests/sec`;
      } else {
        focus = `Postgres "${componentId}" handled ${metrics.writeHandledRps.toLocaleString("en-US")} of ${metrics.writeRps.toLocaleString("en-US")} write requests/sec`;
      }
    }
  }

  return { ratio, focus };
}

function headroomFromCapacity(
  services: Readonly<Record<string, ServiceCapacityMetrics>>,
  postgres: Readonly<Record<string, PostgresCapacityMetrics>>,
): { headroom: number; focus: string } {
  let headroom = Number.POSITIVE_INFINITY;
  let focus = "No capacity-bearing components were present.";

  for (const [componentId, metrics] of Object.entries(services)) {
    if (metrics.headroom < headroom) {
      headroom = metrics.headroom;
      focus = `Service "${componentId}" has ${formatRatioPercent(metrics.headroom)} capacity headroom`;
    }
  }

  for (const [componentId, metrics] of Object.entries(postgres)) {
    const postgresHeadroom = 1 - metrics.effectiveUtilization;
    if (postgresHeadroom < headroom) {
      headroom = postgresHeadroom;
      focus = `Postgres "${componentId}" has ${formatRatioPercent(postgresHeadroom)} capacity headroom`;
    }
  }

  if (!Number.isFinite(headroom)) headroom = 0;
  return { headroom, focus };
}

function evaluateThroughput(requirement: RequirementDefinition, snapshot: OutcomeSnapshot): RequirementResult {
  const passed = compare(snapshot.throughputRatio, requirement.comparator, requirement.target);
  const required = formatRatioPercent(requirement.target);
  const actual = formatRatioPercent(snapshot.throughputRatio);
  return {
    id: requirement.id,
    type: requirement.type,
    passed,
    actual: snapshot.throughputRatio,
    target: requirement.target,
    operator: requirement.comparator,
    explanation: passed
      ? `Handled ${actual} of required throughput; challenge requires at least ${required}.`
      : `${snapshot.throughputExplanationFocus}; challenge requires at least ${required}.`,
  };
}

function evaluateLatency(requirement: RequirementDefinition, snapshot: OutcomeSnapshot): RequirementResult {
  const passed = compare(snapshot.p95LatencyMs, requirement.comparator, requirement.target);
  return {
    id: requirement.id,
    type: requirement.type,
    passed,
    actual: snapshot.p95LatencyMs,
    target: requirement.target,
    operator: requirement.comparator,
    explanation: passed
      ? `Request p95 is ${snapshot.p95LatencyMs.toFixed(1)}ms; challenge requires less than ${requirement.target}ms.`
      : `Request p95 is ${snapshot.p95LatencyMs.toFixed(1)}ms; challenge requires less than ${requirement.target}ms.`,
  };
}

function evaluateHeadroom(requirement: RequirementDefinition, snapshot: OutcomeSnapshot): RequirementResult {
  const passed = compare(snapshot.headroom, requirement.comparator, requirement.target);
  const required = formatRatioPercent(requirement.target);
  return {
    id: requirement.id,
    type: requirement.type,
    passed,
    actual: snapshot.headroom,
    target: requirement.target,
    operator: requirement.comparator,
    explanation: passed
      ? `${snapshot.headroomExplanationFocus}; challenge requires at least ${required}.`
      : `${snapshot.headroomExplanationFocus}; challenge requires at least ${required}.`,
  };
}

function evaluateBudget(requirement: RequirementDefinition, snapshot: OutcomeSnapshot): RequirementResult {
  const passed = compare(snapshot.cost.monthlyTotal, requirement.comparator, requirement.target);
  const actual = `$${snapshot.cost.monthlyTotal.toLocaleString("en-US")}`;
  const target = `$${requirement.target.toLocaleString("en-US")}`;
  return {
    id: requirement.id,
    type: requirement.type,
    passed,
    actual: snapshot.cost.monthlyTotal,
    target: requirement.target,
    operator: requirement.comparator,
    explanation: passed
      ? `Monthly infrastructure cost is ${actual}; challenge budget is ${target}.`
      : `Monthly infrastructure cost is ${actual}; challenge budget is ${target}.`,
  };
}

const evaluators: Record<
  RequirementType,
  (requirement: RequirementDefinition, snapshot: OutcomeSnapshot) => RequirementResult
> = {
  throughput: evaluateThroughput,
  latency: evaluateLatency,
  headroom: evaluateHeadroom,
  budget: evaluateBudget,
};

function requirementEvent(result: RequirementResult): SimulationEvent {
  return {
    type: result.passed ? "requirement_passed" : "requirement_failed",
    data: {
      requirementId: result.id,
      type: result.type,
      actual: result.actual,
      target: result.target,
      explanation: result.explanation,
    },
  };
}

/**
 * Evaluates challenge requirements from simulated outcomes and cost.
 * Configuration-driven: never inspects component names or prescribed topologies.
 */
export function evaluateRequirements(input: TrafficPropagationInput): RequirementsEvaluationResult {
  const latency = evaluatePathLatency(input);
  if (!latency.valid) return latency;

  const throughput = throughputFromCapacity(latency.services, latency.postgres);
  const headroom = headroomFromCapacity(latency.services, latency.postgres);
  const cost = estimateMonthlyCost({
    architecture: input.architecture as Architecture,
    registry: input.registry,
  });
  const snapshot: OutcomeSnapshot = {
    throughputRatio: throughput.ratio,
    throughputExplanationFocus: throughput.focus,
    p95LatencyMs: latency.p95LatencyMs,
    headroom: headroom.headroom,
    headroomExplanationFocus: headroom.focus,
    cost,
  };

  const challenge = input.challenge as ChallengeDefinition;
  const requirements = challenge.requirements.map((requirement) => {
    const evaluator = evaluators[requirement.type];
    return evaluator(requirement, snapshot);
  });
  const allRequirementsPass = requirements.every((requirement) => requirement.passed);
  const events = [...latency.events, ...requirements.map(requirementEvent)];

  return {
    valid: true,
    traffic: latency.traffic,
    caches: latency.caches,
    events,
    services: latency.services,
    postgres: latency.postgres,
    requirements,
    allRequirementsPass,
    p95LatencyMs: latency.p95LatencyMs,
    cost,
    throughputRatio: throughput.ratio,
    headroom: headroom.headroom,
  };
}
