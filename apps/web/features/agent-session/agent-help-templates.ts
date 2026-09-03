import type { AgentPendingHelpRequest, AgentSessionFocus, PromptIntent } from "@faultline/agent-capabilities";

export type AgentHelpChipId =
  | "ask-about-selection"
  | "trace-workload"
  | "review-requirement"
  | "review-cost"
  | "start-interview";

export interface AgentHelpChipDefinition {
  readonly id: AgentHelpChipId;
  readonly label: string;
  readonly template: string;
  readonly clipboardPrompt: string;
  readonly requiresSelection: boolean;
  readonly promptIntent?: PromptIntent;
  readonly suggestedCapabilityNames: readonly string[];
  readonly routingIntent?: "design_interview";
}

export const AGENT_HELP_CHIPS: readonly AgentHelpChipDefinition[] = [
  {
    id: "ask-about-selection",
    label: "Review selection",
    template: "Coach the player about their selected component.",
    clipboardPrompt:
      "Review my selected component using the current Faultline evidence. Give one grounded finding and one question; do not modify the design.",
    requiresSelection: true,
    promptIntent: "component_review",
    suggestedCapabilityNames: ["inspect_component", "review_current_design", "get_metrics"],
  },
  {
    id: "trace-workload",
    label: "Trace workload",
    template: "Trace the focused workload channel or path.",
    clipboardPrompt:
      "Trace my focused workload path in Faultline and show me the first weak link. Give one verified finding and one question; do not modify the design.",
    requiresSelection: false,
    promptIntent: "workload_trace",
    suggestedCapabilityNames: ["inspect_design_entity", "review_current_design", "get_metrics"],
  },
  {
    id: "review-requirement",
    label: "Review requirement",
    template: "Investigate the focused or failing requirement.",
    clipboardPrompt:
      "Why is this requirement failing in Faultline? Use current evidence, give one finding and one question; do not modify the design or recommend specific components to add.",
    requiresSelection: false,
    promptIntent: "requirement_failure",
    suggestedCapabilityNames: ["review_current_design", "get_requirements", "get_metrics"],
  },
  {
    id: "review-cost",
    label: "Review cost",
    template: "Explain the current monthly cost breakdown.",
    clipboardPrompt:
      "Review my deterministic cost pressure in Faultline without changing the design. Give one grounded finding and one question.",
    requiresSelection: false,
    promptIntent: "cost_review",
    suggestedCapabilityNames: ["get_cost_breakdown", "review_current_design", "inspect_design_entity"],
  },
  {
    id: "start-interview",
    label: "Interview me",
    template: "Start the Faultline design interview.",
    clipboardPrompt: "Interview me on this architecture. Call start_design_interview first and ask only the returned question—do not invent a freeform interview.",
    requiresSelection: false,
    routingIntent: "design_interview",
    suggestedCapabilityNames: ["start_design_interview"],
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
    ...(chip.promptIntent ? { promptIntent: chip.promptIntent } : {}),
    ...(chip.routingIntent ? { routingIntent: chip.routingIntent } : {}),
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
