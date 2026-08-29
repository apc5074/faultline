import type { RequirementsEvaluationResult, SimulationEvent } from "@faultline/simulator";

type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;

export type RunFailureFocus =
  | { kind: "component"; componentId: string }
  | { kind: "requirements"; requirementId: string };

/**
 * Resolves only simulator-issued evidence. Aggregate latency and budget misses
 * intentionally stay on the requirements surface: the UI does not invent a
 * component-level cause for them.
 */
export function firstFailureFocus(result: SuccessfulSimulation): RunFailureFocus | null {
  const failedRequirement = result.requirements.find((requirement) => !requirement.passed);
  const requirementId = failedRequirement?.id ?? (result.hotKey.active && !result.hotKey.passed ? "hot-key" : null);
  if (!requirementId) return null;

  if (requirementId === "hot-key") {
    const componentId = result.hotKey.saturatedComponentIds[0];
    return componentId ? { kind: "component", componentId } : { kind: "requirements", requirementId };
  }

  if (failedRequirement?.type === "throughput" || failedRequirement?.type === "headroom") {
    const componentId = firstSaturatedComponent(result.events);
    return componentId ? { kind: "component", componentId } : { kind: "requirements", requirementId };
  }

  return { kind: "requirements", requirementId };
}

function firstSaturatedComponent(events: readonly SimulationEvent[]): string | null {
  for (const event of events) {
    if (event.type === "component_saturated" && event.componentId) return event.componentId;
  }
  return null;
}
