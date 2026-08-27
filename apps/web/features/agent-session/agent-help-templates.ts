import type { AgentPendingHelpRequest } from "@faultline/agent-capabilities";

export type AgentHelpChipId =
  | "ask-about-selection"
  | "find-bottleneck"
  | "check-hot-path-risk"
  | "explain-cost";

export interface AgentHelpChipDefinition {
  readonly id: AgentHelpChipId;
  readonly label: string;
  readonly template: string;
  readonly clipboardPrompt: string;
  readonly requiresSelection: boolean;
}

export const AGENT_HELP_CHIPS: readonly AgentHelpChipDefinition[] = [
  {
    id: "ask-about-selection",
    label: "Ask about selection",
    template: "Coach the player about their selected component.",
    clipboardPrompt:
      "The player clicked Ask about selection on the Faultline canvas. Call get_session_focus first, then inspect_component on the selected component. Respond with one grounded finding and one focused question. Do not change the architecture.",
    requiresSelection: true,
  },
  {
    id: "find-bottleneck",
    label: "Find bottleneck",
    template: "Find the current capacity or throughput bottleneck.",
    clipboardPrompt:
      "The player asked to find the bottleneck. Call get_session_focus, get_architecture, get_metrics, and estimate_capacity. Identify the tightest constraint with evidence, then ask one next investigative question.",
    requiresSelection: false,
  },
  {
    id: "check-hot-path-risk",
    label: "Check hot-path risk",
    template: "Assess hot-path and hot-key risk for this design.",
    clipboardPrompt:
      "The player asked about hot-path risk. Call get_session_focus, get_challenge, get_metrics, and inspect relevant components. Assess hot-key and latency risk from simulator evidence only, then ask one focused question.",
    requiresSelection: false,
  },
  {
    id: "explain-cost",
    label: "Explain cost",
    template: "Explain the current monthly cost breakdown.",
    clipboardPrompt:
      "The player asked for a cost explanation. Call get_session_focus, get_cost_breakdown, and inspect components with the largest line items. Summarize the biggest drivers with evidence, then ask one tradeoff question.",
    requiresSelection: false,
  },
] as const;

export function buildPendingHelpRequest(
  chip: AgentHelpChipDefinition,
  selectedComponentId: string | null,
): AgentPendingHelpRequest {
  return {
    id: chip.id,
    template: chip.template,
    ...(chip.requiresSelection && selectedComponentId ? { componentId: selectedComponentId } : {}),
  };
}

export function isAgentHelpChipEnabled(
  chip: AgentHelpChipDefinition,
  selectedComponentId: string | null,
): boolean {
  return !chip.requiresSelection || selectedComponentId !== null;
}
