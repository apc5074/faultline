import type { AgentPendingHelpRequest, AgentSessionFocus, PromptIntent } from "@faultline/agent-capabilities";

export type AgentHelpChipId =
  | "ask-about-selection"
  | "trace-workload"
  | "review-requirement"
  | "review-cost";

export interface AgentHelpChipDefinition {
  readonly id: AgentHelpChipId;
  readonly label: string;
  readonly template: string;
  readonly clipboardPrompt: string;
  readonly requiresSelection: boolean;
  readonly promptIntent: PromptIntent;
  readonly suggestedCapabilityNames: readonly string[];
}

export const AGENT_HELP_CHIPS: readonly AgentHelpChipDefinition[] = [
  {
    id: "ask-about-selection",
    label: "Review selection",
    template: "Coach the player about their selected component.",
    clipboardPrompt:
      "In Faultline, review my current focus. Call get_coaching_policy and get_session_focus first, then inspect the selected component and relevant simulator evidence. Give one grounded finding, optionally highlight a verified reference, and end with one question. Do not modify architecture or prescribe a final topology.",
    requiresSelection: true,
    promptIntent: "component_review",
    suggestedCapabilityNames: ["get_coaching_policy", "get_session_focus", "inspect_component", "get_metrics"],
  },
  {
    id: "trace-workload",
    label: "Trace workload",
    template: "Trace the focused workload channel or path.",
    clipboardPrompt:
      "In Faultline, trace the relevant workload channel or path. Call get_coaching_policy and get_session_focus first. Prefer targeted component and simulator evidence before get_architecture. Explain one verified path finding, optionally highlight a real reference, and ask one question. Do not modify architecture or prescribe a final topology.",
    requiresSelection: false,
    promptIntent: "workload_trace",
    suggestedCapabilityNames: ["get_coaching_policy", "get_session_focus", "inspect_component", "get_metrics"],
  },
  {
    id: "review-requirement",
    label: "Review requirement",
    template: "Investigate the focused or failing requirement.",
    clipboardPrompt:
      "In Faultline, investigate a focused or failing requirement. Call get_coaching_policy and get_session_focus, then get_requirements and current simulator evidence. Give one grounded finding and the smallest next investigation. Do not modify architecture or prescribe a final topology.",
    requiresSelection: false,
    promptIntent: "requirement_failure",
    suggestedCapabilityNames: ["get_coaching_policy", "get_session_focus", "get_requirements", "get_metrics"],
  },
  {
    id: "review-cost",
    label: "Review cost",
    template: "Explain the current monthly cost breakdown.",
    clipboardPrompt:
      "In Faultline, review deterministic cost evidence. Call get_coaching_policy and get_session_focus, then get_cost_breakdown and targeted component evidence if needed. Give one grounded finding and one question. Do not modify architecture or prescribe a final topology.",
    requiresSelection: false,
    promptIntent: "cost_review",
    suggestedCapabilityNames: ["get_coaching_policy", "get_session_focus", "get_cost_breakdown", "inspect_component"],
  },
] as const;

export function buildPendingHelpRequest(
  chip: AgentHelpChipDefinition,
  focus: AgentSessionFocus,
  focusRevision: number,
): AgentPendingHelpRequest {
  return {
    id: chip.id,
    template: chip.template,
    promptIntent: chip.promptIntent,
    focusRevision,
    suggestedCapabilityNames: chip.suggestedCapabilityNames,
    ...(focus.kind === "component" ? { componentId: focus.componentId } : {}),
    ...(focus.kind === "connection" ? { connectionId: focus.connectionId } : {}),
    ...(focus.kind === "region" ? { regionId: focus.regionId } : {}),
    ...(focus.kind === "requirement" ? { requirementId: focus.requirementId } : {}),
    ...(focus.kind === "workload_channel" ? { workloadChannelId: focus.workloadChannelId } : {}),
  };
}

export function isAgentHelpChipEnabled(
  chip: AgentHelpChipDefinition,
  focus: AgentSessionFocus,
): boolean {
  return !chip.requiresSelection || focus.kind === "component";
}
