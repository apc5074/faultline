/** Stable Phase 5/6 read capabilities available to every Level 1 player. */
export const BASELINE_READ_CAPABILITY_NAMES = [
  "review_current_design",
  "get_coaching_policy",
  "get_session_focus",
  "get_challenge",
  "get_requirements",
  "get_architecture",
  "inspect_component",
  "estimate_capacity",
  "get_metrics",
  "get_cost_breakdown",
] as const;

/** Phase 7 semantic read capabilities gated by canonical architecture structure. */
export const PHASE_7_DYNAMIC_CAPABILITY_NAMES = [
  "inspect_cache",
  "inspect_replication",
  "inspect_regional_traffic",
  "inspect_queue",
  "inspect_processing",
  "inspect_object_storage",
  "inspect_playback_origin",
] as const;

/** Phase 8 experiment capabilities; resolved on their own non-read surface. */
export const PHASE_8_EXPERIMENT_CAPABILITY_NAMES = [
  "run_load_test",
  "change_traffic_pattern",
  "flush_cache",
  "inject_component_failure",
  "inject_region_failure",
  "slow_consumers",
] as const;
export const PHASE_8_READ_CAPABILITY_NAMES = ["inspect_bottlenecks"] as const;

/** WebMCP production profile; the complete registry remains available to other adapters and the dev inspector. */
export const WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES = [
  "review_current_design",
  "inspect_component",
  "get_architecture",
  "get_metrics",
  "get_cost_breakdown",
  ...PHASE_7_DYNAMIC_CAPABILITY_NAMES,
] as const;
export const WEBMCP_PRODUCTION_VISUAL_CAPABILITY_NAMES = [
  "focus_component",
  "annotate_component",
  "highlight_connection",
  "clear_annotations",
] as const;

export type BaselineReadCapabilityName = (typeof BASELINE_READ_CAPABILITY_NAMES)[number];
export type Phase7DynamicCapabilityName = (typeof PHASE_7_DYNAMIC_CAPABILITY_NAMES)[number];
export type Phase8ExperimentCapabilityName = (typeof PHASE_8_EXPERIMENT_CAPABILITY_NAMES)[number];
export type Phase8ReadCapabilityName = (typeof PHASE_8_READ_CAPABILITY_NAMES)[number];
export type ResolvedCapabilityName = BaselineReadCapabilityName | Phase7DynamicCapabilityName;

/** Baseline visual coaching capabilities available on every Level 1 canvas. */
export const BASELINE_VISUAL_CAPABILITY_NAMES = [
  "focus_component",
  "annotate_component",
  "highlight_connection",
  "clear_annotations",
  "focus_region",
  "pin_observation",
] as const;

export type BaselineVisualCapabilityName = (typeof BASELINE_VISUAL_CAPABILITY_NAMES)[number];

/** Documented resolver order: baseline first, then Phase 7 dynamic tools. */
export const RESOLVED_CAPABILITY_NAME_ORDER = [
  ...BASELINE_READ_CAPABILITY_NAMES,
  ...PHASE_7_DYNAMIC_CAPABILITY_NAMES,
] as const;

export const RESOLVED_VISUAL_CAPABILITY_NAME_ORDER = [...BASELINE_VISUAL_CAPABILITY_NAMES] as const;

const baselineNameSet = new Set<string>(BASELINE_READ_CAPABILITY_NAMES);
const dynamicNameSet = new Set<string>(PHASE_7_DYNAMIC_CAPABILITY_NAMES);
const baselineVisualNameSet = new Set<string>(BASELINE_VISUAL_CAPABILITY_NAMES);

export function isBaselineReadCapabilityName(name: string): name is BaselineReadCapabilityName {
  return baselineNameSet.has(name);
}

export function isPhase7DynamicCapabilityName(name: string): name is Phase7DynamicCapabilityName {
  return dynamicNameSet.has(name);
}

export function isBaselineVisualCapabilityName(name: string): name is BaselineVisualCapabilityName {
  return baselineVisualNameSet.has(name);
}

export function isResolvedCapabilityName(name: string): name is ResolvedCapabilityName {
  return isBaselineReadCapabilityName(name) || isPhase7DynamicCapabilityName(name);
}
