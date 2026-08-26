/** Stable Phase 5/6 read capabilities available to every Level 1 player. */
export const BASELINE_READ_CAPABILITY_NAMES = [
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
] as const;

export type BaselineReadCapabilityName = (typeof BASELINE_READ_CAPABILITY_NAMES)[number];
export type Phase7DynamicCapabilityName = (typeof PHASE_7_DYNAMIC_CAPABILITY_NAMES)[number];
export type ResolvedCapabilityName = BaselineReadCapabilityName | Phase7DynamicCapabilityName;

/** Documented resolver order: baseline first, then Phase 7 dynamic tools. */
export const RESOLVED_CAPABILITY_NAME_ORDER = [
  ...BASELINE_READ_CAPABILITY_NAMES,
  ...PHASE_7_DYNAMIC_CAPABILITY_NAMES,
] as const;

const baselineNameSet = new Set<string>(BASELINE_READ_CAPABILITY_NAMES);
const dynamicNameSet = new Set<string>(PHASE_7_DYNAMIC_CAPABILITY_NAMES);

export function isBaselineReadCapabilityName(name: string): name is BaselineReadCapabilityName {
  return baselineNameSet.has(name);
}

export function isPhase7DynamicCapabilityName(name: string): name is Phase7DynamicCapabilityName {
  return dynamicNameSet.has(name);
}

export function isResolvedCapabilityName(name: string): name is ResolvedCapabilityName {
  return isBaselineReadCapabilityName(name) || isPhase7DynamicCapabilityName(name);
}
