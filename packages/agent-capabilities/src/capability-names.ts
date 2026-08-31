import type { ProductionCapabilityGroup } from "./capability.js";

/** Stable Phase 5/6 read capabilities available to every Level 1 player. */
export const BASELINE_READ_CAPABILITY_NAMES = [
  "review_current_design",
  "expand_design_evidence",
  "compare_design_evidence",
  "inspect_design_entity",
  "inspect_component_option",
  "get_coaching_policy",
  "start_design_interview",
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

export type ResolvedCapabilityName = BaselineReadCapabilityName | Phase7DynamicCapabilityName;

export const PRODUCTION_CAPABILITY_MANIFEST_VERSION = "wmp-production-1" as const;

export const PRODUCTION_CAPABILITY_MANIFEST = [
  { name: "review_current_design", production: true, group: "stable-review" },
  { name: "start_design_interview", production: true, group: "stable-review" },
  { name: "expand_design_evidence", production: true, group: "stable-review" },
  { name: "inspect_design_entity", production: true, group: "stable-review" },
  { name: "inspect_component_option", production: true, group: "stable-review" },
  { name: "compare_design_evidence", production: true, group: "stable-review" },
  { name: "get_architecture", production: true, group: "stable-review" },
  { name: "inspect_component", production: true, group: "stable-review" },
  { name: "estimate_capacity", production: true, group: "stable-review" },
  { name: "get_metrics", production: true, group: "stable-review" },
  { name: "get_cost_breakdown", production: true, group: "stable-review" },
  { name: "inspect_cache", production: true, group: "specialists" },
  { name: "inspect_replication", production: true, group: "specialists" },
  { name: "inspect_regional_traffic", production: true, group: "specialists" },
  { name: "inspect_queue", production: true, group: "specialists" },
  { name: "inspect_processing", production: true, group: "specialists" },
  { name: "inspect_object_storage", production: true, group: "specialists" },
  { name: "inspect_playback_origin", production: true, group: "specialists" },
  { name: "focus_component", production: true, group: "stable-visual" },
  { name: "annotate_component", production: true, group: "stable-visual" },
  { name: "highlight_connection", production: true, group: "stable-visual" },
  { name: "clear_annotations", production: true, group: "stable-visual" },
  { name: "run_load_test", production: true, group: "experiments" },
  { name: "change_traffic_pattern", production: true, group: "experiments" },
  { name: "flush_cache", production: true, group: "experiments" },
  { name: "inject_component_failure", production: true, group: "experiments" },
  { name: "inject_region_failure", production: true, group: "experiments" },
  { name: "slow_consumers", production: true, group: "experiments" },
] as const;

export type ProductionCapabilityName = (typeof PRODUCTION_CAPABILITY_MANIFEST)[number]["name"];
export function productionCapabilityExposure(name: string) {
  const entry = PRODUCTION_CAPABILITY_MANIFEST.find((candidate) => candidate.name === name);
  return entry ? { production: entry.production, group: entry.group } : undefined;
}

export function productionCapabilityGroup(name: string): ProductionCapabilityGroup | undefined {
  return PRODUCTION_CAPABILITY_MANIFEST.find((candidate) => candidate.name === name)?.group;
}

function productionNames(group: ProductionCapabilityGroup): readonly string[] {
  return PRODUCTION_CAPABILITY_MANIFEST.filter((entry) => entry.production && entry.group === group).map((entry) => entry.name);
}

/** WebMCP production profile; the complete registry remains available to other adapters and the dev inspector. */
export const WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES = [
  ...productionNames("stable-review"),
  ...productionNames("specialists"),
] as const;
export const WEBMCP_PRODUCTION_VISUAL_CAPABILITY_NAMES = [...productionNames("stable-visual")] as const;
export const WEBMCP_PRODUCTION_EXPERIMENT_CAPABILITY_NAMES = [...productionNames("experiments")] as const;

export type BaselineReadCapabilityName = (typeof BASELINE_READ_CAPABILITY_NAMES)[number];
export type Phase7DynamicCapabilityName = (typeof PHASE_7_DYNAMIC_CAPABILITY_NAMES)[number];
export type Phase8ExperimentCapabilityName = (typeof PHASE_8_EXPERIMENT_CAPABILITY_NAMES)[number];
export type Phase8ReadCapabilityName = (typeof PHASE_8_READ_CAPABILITY_NAMES)[number];
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
