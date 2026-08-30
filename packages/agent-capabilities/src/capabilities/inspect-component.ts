import type { ComponentInstance, CostResult, JsonObject } from "@faultline/core";

import type { AgentCapability } from "../capability.js";
import type { AgentContext, AgentSimulationEvidence, EvidenceMeta } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { inspectComponentInputSchema, type InspectComponentInput } from "../schemas.js";
import type { AgentWorkloadFitEvidence } from "../workload-fit-evidence.js";

/** Compact component inspection for agent grounding. */
export interface InspectComponentOutput {
  readonly id: string;
  readonly type: string;
  readonly config: JsonObject;
  readonly metrics?: Readonly<Record<string, number>>;
  readonly monthlyCost?: number;
  /** Role / mechanism / ceiling / effective / pressures when simulator evidence includes them. */
  readonly workloadFit?: AgentWorkloadFitEvidence;
  readonly evidence?: EvidenceMeta;
}

function monthlyCostForComponent(cost: CostResult | undefined, componentId: string): number | undefined {
  if (!cost) return undefined;
  const amount = cost.lineItems
    .filter((item) => item.componentId === componentId)
    .reduce((sum, item) => sum + item.amount, 0);
  return cost.lineItems.some((item) => item.componentId === componentId) ? amount : undefined;
}

function evidenceForComponent(simulation: AgentSimulationEvidence | undefined, componentId: string) {
  if (!simulation || simulation.available !== true) return undefined;
  return simulation.components[componentId];
}

function buildOutput(component: ComponentInstance, context: AgentContext): InspectComponentOutput {
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

/**
 * Inspect one architecture component using trusted AgentContext evidence.
 * Does not invent metrics or duplicate simulator capacity formulas.
 */
export function inspectComponent(
  context: AgentContext,
  input: InspectComponentInput,
): CapabilityResult<InspectComponentOutput> {
  const component = context.architecture.components.find((candidate) => candidate.id === input.componentId);
  if (!component) {
    return capabilityError("NOT_FOUND", `Unknown component "${input.componentId}".`);
  }
  return capabilityOk(buildOutput(component, context));
}

export const inspectComponentCapability: AgentCapability<
  AgentContext,
  InspectComponentInput,
  CapabilityResult<InspectComponentOutput>
> = {
  name: "inspect_component",
  description:
    "Inspect one infrastructure component: config, simulator metrics, workload-fit evidence when present, and monthly cost when available. Returns NOT_FOUND for unknown IDs.",
  inputSchema: inspectComponentInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context, input) {
    return inspectComponent(context, input);
  },
};
