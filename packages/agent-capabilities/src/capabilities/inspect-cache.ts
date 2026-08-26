import type { CostResult, JsonObject } from "@faultline/core";

import { architectureHasRedis } from "../architecture-predicates.js";
import type { AgentCapability } from "../capability.js";
import {
  compactDeployments,
  componentsOfType,
  selectComponentById,
  type CompactDeployment,
} from "../component-selection.js";
import type { AgentContext, AgentSimulationEvidence } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { inspectCacheInputSchema, type InspectCacheInput } from "../schemas.js";

/** Compact Redis cache inspection for agent grounding. */
export interface InspectCacheOutput {
  readonly componentId: string;
  readonly config: JsonObject;
  readonly deployments?: readonly CompactDeployment[];
  readonly metrics?: Readonly<Record<string, number>>;
  readonly monthlyCost?: number;
}

function monthlyCostForComponent(cost: CostResult | undefined, componentId: string): number | undefined {
  if (!cost) return undefined;
  const amount = cost.lineItems
    .filter((item) => item.componentId === componentId)
    .reduce((sum, item) => sum + item.amount, 0);
  return cost.lineItems.some((item) => item.componentId === componentId) ? amount : undefined;
}

function metricsForComponent(
  simulation: AgentSimulationEvidence | undefined,
  componentId: string,
): Readonly<Record<string, number>> | undefined {
  if (!simulation || simulation.available !== true) return undefined;
  const evidence = simulation.components[componentId];
  if (!evidence) return undefined;
  return evidence.metrics;
}

function buildOutput(context: AgentContext, componentId: string, config: JsonObject, deployments: readonly CompactDeployment[]) {
  const metrics = metricsForComponent(context.simulation, componentId);
  const monthlyCost = monthlyCostForComponent(context.cost, componentId);
  return {
    componentId,
    config,
    ...(deployments.length > 0 ? { deployments } : {}),
    ...(metrics ? { metrics } : {}),
    ...(monthlyCost !== undefined ? { monthlyCost } : {}),
  };
}

/**
 * Inspect one Redis cache component using trusted AgentContext evidence.
 * Does not invent cache metrics or expose cache mutation actions.
 */
export function inspectCache(
  context: AgentContext,
  input: InspectCacheInput = {},
): CapabilityResult<InspectCacheOutput> {
  const selection = selectComponentById(
    componentsOfType(context.architecture.components, "redis"),
    input.componentId,
    "Redis cache",
  );
  if (!selection.ok) {
    return capabilityError(selection.code, selection.message);
  }

  const component = selection.component;
  return capabilityOk(
    buildOutput(context, component.id, component.config, compactDeployments(component.deployments)),
  );
}

export const inspectCacheCapability: AgentCapability<
  AgentContext,
  InspectCacheInput,
  CapabilityResult<InspectCacheOutput>
> = {
  name: "inspect_cache",
  description:
    "Inspect one Redis cache: configuration, regional footprint, simulator cache metrics, and monthly cost when available. Omit componentId when only one Redis exists.",
  inputSchema: inspectCacheInputSchema,
  mode: "read",
  availableWhen: (context) => architectureHasRedis(context.architecture),
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context, input) {
    return inspectCache(context, input);
  },
};
