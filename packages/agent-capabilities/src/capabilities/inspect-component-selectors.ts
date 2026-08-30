import type { ComponentInstance, CostResult, JsonObject } from "@faultline/core";

import type { AgentContext, AgentSimulationEvidence, EvidenceMeta } from "../context.js";
import type { AgentWorkloadFitEvidence } from "../workload-fit-evidence.js";

/** Compact component inspection for agent grounding. */
export interface InspectComponentOutput {
  readonly id: string;
  readonly type: string;
  readonly config: JsonObject;
  readonly metrics?: Readonly<Record<string, number>>;
  readonly monthlyCost?: number;
  readonly workloadFit?: AgentWorkloadFitEvidence;
  readonly evidence?: EvidenceMeta;
}

function monthlyCostForComponent(cost: CostResult | undefined, componentId: string): number | undefined {
  if (!cost) return undefined;
  const amount = cost.lineItems.filter((item) => item.componentId === componentId).reduce((sum, item) => sum + item.amount, 0);
  return cost.lineItems.some((item) => item.componentId === componentId) ? amount : undefined;
}

function evidenceForComponent(simulation: AgentSimulationEvidence | undefined, componentId: string) {
  if (!simulation || simulation.available !== true) return undefined;
  return simulation.components[componentId];
}

/** Shared component projection for inspect_component and inspect_design_entity. */
export function buildOutput(component: ComponentInstance, context: AgentContext): InspectComponentOutput {
  const evidence = evidenceForComponent(context.simulation, component.id);
  const monthlyCost = monthlyCostForComponent(context.cost, component.id);
  return {
    id: component.id,
    type: component.type,
    config: component.config,
    ...(evidence?.metrics ? { metrics: evidence.metrics } : {}),
    ...(monthlyCost !== undefined ? { monthlyCost } : {}),
    ...(evidence?.workloadFit ? { workloadFit: evidence.workloadFit } : {}),
    ...(context.evidenceMeta ? { evidence: context.evidenceMeta } : {}),
  };
}
