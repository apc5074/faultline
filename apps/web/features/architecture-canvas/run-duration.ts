import type { RequirementResult } from "@faultline/core";
import type { RequirementsEvaluationResult } from "@faultline/simulator";

type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;

export const MIN_RUN_DURATION_MS = 1000;
export const MAX_RUN_DURATION_MS = 5000;

/**
 * Calibration: traffic term saturates at the largest authored workload
 * (~150k RPS across Level 1/2 challenges), so ordinary Level 1 runs land
 * mid-range and only extreme volumes push toward the cap.
 */
const TRAFFIC_TERM_MAX_MS = 1200;
const TRAFFIC_REFERENCE_RPS = 150_000;
const MISS_TERM_MAX_PER_REQUIREMENT_MS = 650;
const HOT_KEY_MISS_MS = 600;

export interface RunDurationBreakdown {
  baseMs: number;
  trafficTermMs: number;
  missTermMs: number;
  totalMs: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Normalized miss severity in [0, 1]: 0 = barely missed, 1 = missed by the full target or more. */
export function requirementMissSeverity(requirement: RequirementResult): number {
  if (requirement.passed) return 0;
  const { actual, target, operator } = requirement;
  if (operator === "gte") {
    if (target <= 0) return actual < target ? 1 : 0;
    return clamp01((target - actual) / target);
  }
  if (target <= 0) return actual > target ? 1 : 0;
  return clamp01((actual - target) / target);
}

function peakRps(result: SuccessfulSimulation): number {
  let peak = 0;
  for (const traffic of Object.values(result.traffic)) {
    if (traffic.incomingRps > peak) peak = traffic.incomingRps;
  }
  return peak;
}

function trafficTermMs(result: SuccessfulSimulation): number {
  const peak = peakRps(result);
  if (peak <= 0) return 0;
  const scale = Math.log1p(peak) / Math.log1p(TRAFFIC_REFERENCE_RPS);
  return TRAFFIC_TERM_MAX_MS * clamp01(scale);
}

function missTermMs(result: SuccessfulSimulation): number {
  let term = 0;
  for (const requirement of result.requirements) {
    term += MISS_TERM_MAX_PER_REQUIREMENT_MS * requirementMissSeverity(requirement);
  }
  if (result.hotKey.active && !result.hotKey.passed) term += HOT_KEY_MISS_MS;
  return term;
}

/**
 * How long the timed run replay lasts on the canvas. Pure presentation
 * policy: the simulator result is already final; this only stretches time,
 * never truth. Deterministic for a given result.
 */
export function runDurationBreakdown(result: SuccessfulSimulation): RunDurationBreakdown {
  const traffic = trafficTermMs(result);
  const miss = missTermMs(result);
  const totalMs = Math.round(
    Math.min(MAX_RUN_DURATION_MS, MIN_RUN_DURATION_MS + traffic + miss),
  );
  return {
    baseMs: MIN_RUN_DURATION_MS,
    trafficTermMs: Math.round(traffic),
    missTermMs: Math.round(miss),
    totalMs,
  };
}

export function runDurationMs(result: SuccessfulSimulation): number {
  return runDurationBreakdown(result).totalMs;
}

/** Timed replay applies only to valid results; invalid evaluations surface errors immediately. */
export function runTimelineDurationMs(result: RequirementsEvaluationResult): number | null {
  if (!result.valid) return null;
  return runDurationMs(result);
}
