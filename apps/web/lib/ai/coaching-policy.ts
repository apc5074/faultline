import { buildCoachingPolicy as buildSharedCoachingPolicy, type AgentContext } from "@faultline/agent-capabilities";

export type AgentComponentReference = {
  componentId: string;
  reason: "inspecting" | "finding" | "question";
};

/** Drop ungrounded references before any future UI transport can consume them. */
export function validateAgentComponentReferences(
  references: readonly AgentComponentReference[],
  context: AgentContext,
): AgentComponentReference[] {
  const componentIds = new Set(context.architecture.components.map((component) => component.id));
  return references.filter((reference) => componentIds.has(reference.componentId)).slice(0, 3);
}

/** One provider-neutral behavioral contract for the embedded AI Engineer. */
export function buildCoachingPolicy(context: AgentContext): string {
  return buildSharedCoachingPolicy(context);
}
