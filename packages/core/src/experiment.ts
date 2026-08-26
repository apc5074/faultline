import type { RequirementResult } from "./challenge.js";
import type { CostResult } from "./cost.js";

/** Supported Level 1 deterministic experiment kinds. */
export const experimentTypes = [
  "traffic_multiplier",
  "hot_key",
  "cache_flush",
  "component_failure",
  "region_failure",
] as const;

export type ExperimentType = (typeof experimentTypes)[number];

export const trafficMultiplierValues = [1.25, 1.5, 2, 3, 5] as const;
export type TrafficMultiplierValue = (typeof trafficMultiplierValues)[number];

export interface TrafficMultiplierParameters {
  multiplier: TrafficMultiplierValue;
}

export interface HotKeyParameters {
  hotKeyReadFraction: number;
}

export interface CacheFlushParameters {
  componentId: string;
}

export interface ComponentFailureParameters {
  componentId: string;
}

export interface RegionFailureParameters {
  regionId: string;
}

export type ExperimentParameters =
  | TrafficMultiplierParameters
  | HotKeyParameters
  | CacheFlushParameters
  | ComponentFailureParameters
  | RegionFailureParameters;

/** One named scenario overlay request. Serializable; never mutates Architecture or ChallengeDefinition. */
export type ExperimentDefinition =
  | { type: "traffic_multiplier"; parameters: TrafficMultiplierParameters }
  | { type: "hot_key"; parameters: HotKeyParameters }
  | { type: "cache_flush"; parameters: CacheFlushParameters }
  | { type: "component_failure"; parameters: ComponentFailureParameters }
  | { type: "region_failure"; parameters: RegionFailureParameters };

/**
 * Normalized overlay fields consumed by the shared simulator.
 * Separate from Architecture, ChallengeDefinition, and catalog config.
 */
export interface ExperimentOverlay {
  trafficMultiplier?: TrafficMultiplierValue;
  hotKeyReadFraction?: number;
  coldCacheComponentIds?: readonly string[];
  failedComponentIds?: readonly string[];
  failedRegionIds?: readonly string[];
}

/** Compact authoritative snapshot derived from a full simulator evaluation. */
export interface ExperimentSummary {
  valid: boolean;
  allRequirementsPass: boolean;
  requirements: readonly RequirementResult[];
  p95LatencyMs: number;
  throughputRatio: number;
  headroom: number;
  cost: CostResult;
  hotKey: {
    active: boolean;
    passed: boolean;
    viralRedirectRps: number;
  };
}

export interface RequirementDelta {
  id: string;
  baselinePassed: boolean;
  outcomePassed: boolean;
  actualDelta: number;
}

/** Simulator-produced diff between baseline and outcome. UI must not recompute. */
export interface ExperimentDelta {
  metrics: {
    p95LatencyMs?: number;
    throughputRatio?: number;
    headroom?: number;
    costMonthlyTotal?: number;
  };
  requirements: {
    newlyFailed: readonly string[];
    newlyPassed: readonly string[];
    changed: readonly RequirementDelta[];
  };
  hotKey?: {
    passedChanged: boolean;
    viralRedirectRpsDelta: number;
  };
}

/** Deterministic simulator event included in experiment results. */
export interface ExperimentEvent {
  type: string;
  connectionId?: string;
  componentId?: string;
  data: Readonly<Record<string, number | string>>;
}

/** Full deterministic experiment envelope returned by evaluateExperiment. */
export interface ExperimentResult {
  type: ExperimentType;
  parameters: ExperimentParameters;
  /** Always true — experiments are temporary simulated overlays, never canonical state. */
  simulated: true;
  baseline: ExperimentSummary;
  outcome: ExperimentSummary;
  delta: ExperimentDelta;
  events: readonly ExperimentEvent[];
  simulatorVersion: string;
}

export type ExperimentErrorCode =
  | "INVALID_INPUT"
  | "UNAVAILABLE_EXPERIMENT"
  | "UNSUPPORTED_TARGET"
  | "INVALID_BASELINE"
  | "CANCELLED";

export interface ExperimentValidationIssue {
  code: ExperimentErrorCode;
  message: string;
  path?: string;
}

export type ExperimentDefinitionValidationResult =
  | { success: true; data: ExperimentDefinition }
  | { success: false; errors: readonly ExperimentValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isExperimentType(value: unknown): value is ExperimentType {
  return typeof value === "string" && (experimentTypes as readonly string[]).includes(value);
}

function isTrafficMultiplierValue(value: unknown): value is TrafficMultiplierValue {
  return typeof value === "number" && (trafficMultiplierValues as readonly number[]).includes(value);
}

function issue(
  errors: ExperimentValidationIssue[],
  code: ExperimentErrorCode,
  message: string,
  path?: string,
): void {
  errors.push({ code, message, path });
}

function validateTrafficMultiplierParameters(
  parameters: unknown,
  errors: ExperimentValidationIssue[],
): parameters is TrafficMultiplierParameters {
  if (!isRecord(parameters)) {
    issue(errors, "INVALID_INPUT", "traffic_multiplier parameters must be an object.", "parameters");
    return false;
  }
  if (!isTrafficMultiplierValue(parameters.multiplier)) {
    issue(
      errors,
      "INVALID_INPUT",
      "traffic_multiplier multiplier must be one of 1.25, 1.5, 2, 3, or 5.",
      "parameters.multiplier",
    );
    return false;
  }
  return true;
}

function validateHotKeyParameters(
  parameters: unknown,
  errors: ExperimentValidationIssue[],
): parameters is HotKeyParameters {
  if (!isRecord(parameters)) {
    issue(errors, "INVALID_INPUT", "hot_key parameters must be an object.", "parameters");
    return false;
  }
  if (!isFiniteNumber(parameters.hotKeyReadFraction)) {
    issue(errors, "INVALID_INPUT", "hot_key hotKeyReadFraction must be a finite number.", "parameters.hotKeyReadFraction");
    return false;
  }
  if (parameters.hotKeyReadFraction <= 0 || parameters.hotKeyReadFraction > 1) {
    issue(
      errors,
      "INVALID_INPUT",
      "hot_key hotKeyReadFraction must be greater than 0 and at most 1.",
      "parameters.hotKeyReadFraction",
    );
    return false;
  }
  return true;
}

function validateComponentIdParameters(
  parameters: unknown,
  errors: ExperimentValidationIssue[],
  experimentType: "cache_flush" | "component_failure",
): parameters is CacheFlushParameters | ComponentFailureParameters {
  if (!isRecord(parameters)) {
    issue(errors, "INVALID_INPUT", `${experimentType} parameters must be an object.`, "parameters");
    return false;
  }
  if (!isNonEmptyString(parameters.componentId)) {
    issue(
      errors,
      "INVALID_INPUT",
      `${experimentType} componentId must be a non-empty string.`,
      "parameters.componentId",
    );
    return false;
  }
  return true;
}

function validateRegionFailureParameters(
  parameters: unknown,
  errors: ExperimentValidationIssue[],
): parameters is RegionFailureParameters {
  if (!isRecord(parameters)) {
    issue(errors, "INVALID_INPUT", "region_failure parameters must be an object.", "parameters");
    return false;
  }
  if (!isNonEmptyString(parameters.regionId)) {
    issue(errors, "INVALID_INPUT", "region_failure regionId must be a non-empty string.", "parameters.regionId");
    return false;
  }
  return true;
}

/** Validates untrusted experiment-shaped data at the package boundary. */
export function validateExperimentDefinition(input: unknown): ExperimentDefinitionValidationResult {
  if (!isRecord(input)) {
    return {
      success: false,
      errors: [{ code: "INVALID_INPUT", message: "Experiment definition must be an object.", path: "experiment" }],
    };
  }

  const errors: ExperimentValidationIssue[] = [];
  if (!isExperimentType(input.type)) {
    issue(errors, "INVALID_INPUT", "Experiment type must be a supported experiment kind.", "type");
  }

  const type = input.type as ExperimentType;
  let parametersValid = false;

  switch (type) {
    case "traffic_multiplier":
      parametersValid = validateTrafficMultiplierParameters(input.parameters, errors);
      break;
    case "hot_key":
      parametersValid = validateHotKeyParameters(input.parameters, errors);
      break;
    case "cache_flush":
      parametersValid = validateComponentIdParameters(input.parameters, errors, "cache_flush");
      break;
    case "component_failure":
      parametersValid = validateComponentIdParameters(input.parameters, errors, "component_failure");
      break;
    case "region_failure":
      parametersValid = validateRegionFailureParameters(input.parameters, errors);
      break;
    default:
      issue(errors, "INVALID_INPUT", "Experiment type must be a supported experiment kind.", "type");
  }

  if (errors.length > 0 || !parametersValid || !isExperimentType(input.type)) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: { type: input.type, parameters: input.parameters } as ExperimentDefinition,
  };
}

/** Maps a validated definition to normalized overlay fields for the simulator. */
export function definitionToOverlay(definition: ExperimentDefinition): ExperimentOverlay {
  switch (definition.type) {
    case "traffic_multiplier":
      return { trafficMultiplier: definition.parameters.multiplier };
    case "hot_key":
      return { hotKeyReadFraction: definition.parameters.hotKeyReadFraction };
    case "cache_flush":
      return { coldCacheComponentIds: [definition.parameters.componentId] };
    case "component_failure":
      return { failedComponentIds: [definition.parameters.componentId] };
    case "region_failure":
      return { failedRegionIds: [definition.parameters.regionId] };
  }
}

/** Returns true when the overlay carries no active scenario fields. */
export function isEmptyOverlay(overlay: ExperimentOverlay): boolean {
  return (
    overlay.trafficMultiplier === undefined &&
    overlay.hotKeyReadFraction === undefined &&
    (overlay.coldCacheComponentIds === undefined || overlay.coldCacheComponentIds.length === 0) &&
    (overlay.failedComponentIds === undefined || overlay.failedComponentIds.length === 0) &&
    (overlay.failedRegionIds === undefined || overlay.failedRegionIds.length === 0)
  );
}
