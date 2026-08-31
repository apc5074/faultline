import { PRODUCTION_CAPABILITY_MANIFEST, productionCapabilityGroup, type ResolvedCapabilityName } from "./capability-names.js";

/** Closed set of user intents understood by the shared routing policy. */
export type ToolRoutingIntent =
  | "component"
  | "component_position"
  | "board_inventory"
  | "relationship"
  | "workload_path"
  | "system_health"
  | "requirement_failure"
  | "overview"
  | "cost"
  | "cache"
  | "replication";

/** Closed target categories used to describe what an intent addresses. */
export type ToolRoutingTarget =
  | "component"
  | "component_type"
  | "relationship"
  | "workload_path"
  | "system"
  | "requirement"
  | "none";

/** Presentation subject shape expected from the selected evidence read. */
export type ToolRoutingFrame = "component" | "set" | "causal_path";

/** Adapter-neutral guidance for selecting the first evidence capability. */
export interface ToolRoutingRule {
  readonly intent: ToolRoutingIntent;
  readonly target: ToolRoutingTarget;
  readonly preferredCapabilityName: ResolvedCapabilityName;
  readonly allowedFallbackCapabilityNames: readonly ResolvedCapabilityName[];
  readonly requiresCurrentTarget: boolean;
  readonly resultFrame: ToolRoutingFrame;
  readonly selectionGuidance: string;
}

/** Compact routing guidance shared by policy and adapter-facing descriptions. */
export const TOOL_ROUTING_GUIDANCE =
  "Routing: before asserting current component existence, count, configuration, deployment, placement, or connection state, perform the direct current-state read during this answer; never use chat history or an earlier evidence revision. Use get_architecture for board inventory, inspect_component for a named component or exact-type count/details with scope all by default (topmost only for positional requests), inspect_design_entity for relationships/workload paths, get_metrics for health, review_current_design for overview or genuine ambiguity; targeted reads frame automatically; use visual tools only for explicit persistent marks or focus gestures.";

/**
 * Shared routing policy for embedded and external agents. This is metadata,
 * not a callable router: the agent host selects the first real capability.
 */
export const TOOL_ROUTING_RULES: readonly ToolRoutingRule[] = [
  {
    intent: "component",
    target: "component",
    preferredCapabilityName: "inspect_component",
    allowedFallbackCapabilityNames: ["inspect_design_entity"],
    requiresCurrentTarget: true,
    resultFrame: "component",
    selectionGuidance: "For a named current component, call inspect_component first using its exact component ID.",
  },
  {
    intent: "component_position",
    target: "component_type",
    preferredCapabilityName: "inspect_component",
    allowedFallbackCapabilityNames: [],
    requiresCurrentTarget: false,
    resultFrame: "component",
    selectionGuidance: "For a component type, use inspect_component with an exact catalog type; use scope all unless the player says topmost.",
  },
  {
    intent: "board_inventory",
    target: "none",
    preferredCapabilityName: "get_architecture",
    allowedFallbackCapabilityNames: [],
    requiresCurrentTarget: false,
    resultFrame: "set",
    selectionGuidance: "For board-wide inventory or current contents, call get_architecture and use its inventory; do not infer counts from prior evidence or chat history.",
  },
  {
    intent: "relationship",
    target: "relationship",
    preferredCapabilityName: "inspect_design_entity",
    allowedFallbackCapabilityNames: ["get_architecture"],
    requiresCurrentTarget: true,
    resultFrame: "causal_path",
    selectionGuidance: "For a named relationship, call inspect_design_entity first with structured endpoint references; use get_architecture only if unresolved.",
  },
  {
    intent: "workload_path",
    target: "workload_path",
    preferredCapabilityName: "inspect_design_entity",
    allowedFallbackCapabilityNames: ["review_current_design"],
    requiresCurrentTarget: true,
    resultFrame: "causal_path",
    selectionGuidance: "For a workload path, call inspect_design_entity first with a structured workload selector; fall back to review_current_design with workload_trace only when needed.",
  },
  {
    intent: "system_health",
    target: "system",
    preferredCapabilityName: "get_metrics",
    allowedFallbackCapabilityNames: ["estimate_capacity"],
    requiresCurrentTarget: false,
    resultFrame: "set",
    selectionGuidance: "For system health, call get_metrics first; use estimate_capacity for capacity-specific follow-up.",
  },
  {
    intent: "requirement_failure",
    target: "requirement",
    preferredCapabilityName: "review_current_design",
    allowedFallbackCapabilityNames: ["inspect_design_entity"],
    requiresCurrentTarget: false,
    resultFrame: "causal_path",
    selectionGuidance: "For a first or named requirement failure, call review_current_design with requirement_failure; inspect_design_entity is a targeted fallback.",
  },
  {
    intent: "overview",
    target: "none",
    preferredCapabilityName: "review_current_design",
    allowedFallbackCapabilityNames: [],
    requiresCurrentTarget: false,
    resultFrame: "set",
    selectionGuidance: "For an overview, current UI focus, retained-revision delta, or genuine ambiguity, call review_current_design.",
  },
  {
    intent: "cost",
    target: "system",
    preferredCapabilityName: "get_cost_breakdown",
    allowedFallbackCapabilityNames: ["review_current_design"],
    requiresCurrentTarget: false,
    resultFrame: "set",
    selectionGuidance: "For cost, call get_cost_breakdown first; use review_current_design with cost_review only for contextual follow-up.",
  },
  {
    intent: "cache",
    target: "component",
    preferredCapabilityName: "inspect_cache",
    allowedFallbackCapabilityNames: ["inspect_component"],
    requiresCurrentTarget: true,
    resultFrame: "component",
    selectionGuidance: "For cache behavior, call inspect_cache first when available; use inspect_component for the named cache component when specialist evidence is unavailable.",
  },
  {
    intent: "replication",
    target: "component",
    preferredCapabilityName: "inspect_replication",
    allowedFallbackCapabilityNames: ["inspect_component"],
    requiresCurrentTarget: true,
    resultFrame: "component",
    selectionGuidance: "For replication behavior, call inspect_replication first when available; use inspect_component for the named replica or primary when specialist evidence is unavailable.",
  },
] as const;

const toolRoutingRuleByIntent = new Map<ToolRoutingIntent, ToolRoutingRule>(
  TOOL_ROUTING_RULES.map((rule) => [rule.intent, rule]),
);

export function getToolRoutingRule(intent: ToolRoutingIntent): ToolRoutingRule {
  return toolRoutingRuleByIntent.get(intent)!;
}

export interface ToolRoutingValidationIssue {
  readonly intent: ToolRoutingIntent;
  readonly capabilityName: string;
  readonly role: "preferred" | "fallback";
  readonly reason: "missing" | "not_production" | "invalid_group";
}

/** Validate that model-facing routing can only name production capabilities. */
export function validateToolRoutingAgainstProduction(
  rules: readonly ToolRoutingRule[] = TOOL_ROUTING_RULES,
): readonly ToolRoutingValidationIssue[] {
  const expectedGroups: Readonly<Record<string, string>> = {
    inspect_component: "stable-review",
    inspect_design_entity: "stable-review",
    get_architecture: "stable-review",
    review_current_design: "stable-review",
    get_metrics: "stable-review",
    estimate_capacity: "stable-review",
    get_cost_breakdown: "stable-review",
    inspect_cache: "specialists",
    inspect_replication: "specialists",
  };
  const issues: ToolRoutingValidationIssue[] = [];
  for (const rule of rules) {
    for (const [role, capabilityName] of [["preferred", rule.preferredCapabilityName], ...rule.allowedFallbackCapabilityNames.map((name) => ["fallback", name] as const)] as const) {
      const manifest = PRODUCTION_CAPABILITY_MANIFEST.find((entry) => entry.name === capabilityName);
      const issue = (reason: ToolRoutingValidationIssue["reason"]) => issues.push({ intent: rule.intent, capabilityName, role, reason });
      if (!manifest) issue("missing");
      else if (!manifest.production) issue("not_production");
      else if (productionCapabilityGroup(capabilityName) !== expectedGroups[capabilityName]) issue("invalid_group");
    }
  }
  return issues;
}
