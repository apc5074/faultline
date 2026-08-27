import type { CostResult, JsonObject } from "@faultline/core";

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
import type { AgentWorkloadFitEvidence } from "../workload-fit-evidence.js";

/** Compact CDN/Redis cache inspection for agent grounding. */
export interface InspectCacheOutput {
  readonly componentId: string;
  readonly cacheType: "cdn" | "redis";
  readonly config: JsonObject;
  readonly deployments?: readonly CompactDeployment[];
  readonly simulationAvailable: boolean;
  readonly eligibleRps?: number;
  readonly servedEligibleRps?: number;
  readonly hitRps?: number;
  readonly missRps?: number;
  readonly hitRate?: number;
  readonly capacityRps?: number;
  readonly utilization?: number;
  readonly downstreamAvoidedRps?: number;
  readonly hotKey?: { readonly active: boolean; readonly passed: boolean };
  readonly coldCacheExperimentAvailable: boolean;
  readonly metrics?: Readonly<Record<string, number>>;
  readonly monthlyCost?: number;
  /** Role / mechanism / ceiling / effective / pressures when simulator evidence includes them. */
  readonly workloadFit?: AgentWorkloadFitEvidence;
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

function workloadFitForComponent(
  simulation: AgentSimulationEvidence | undefined,
  componentId: string,
): AgentWorkloadFitEvidence | undefined {
  if (!simulation || simulation.available !== true) return undefined;
  return simulation.components[componentId]?.workloadFit;
}

function buildOutput(
  context: AgentContext,
  componentId: string,
  type: "cdn" | "redis",
  config: JsonObject,
  deployments: readonly CompactDeployment[],
) {
  const metrics = metricsForComponent(context.simulation, componentId);
  const monthlyCost = monthlyCostForComponent(context.cost, componentId);
  const workloadFit = workloadFitForComponent(context.simulation, componentId);
  return {
    componentId,
    cacheType: type,
    config,
    simulationAvailable: context.simulation?.available === true,
    ...(deployments.length > 0 ? { deployments } : {}),
    ...(metrics?.eligibleRps !== undefined ? { eligibleRps: metrics.eligibleRps } : {}),
    ...(metrics?.servedEligibleRps !== undefined ? { servedEligibleRps: metrics.servedEligibleRps } : {}),
    ...(metrics?.hitRps !== undefined ? { hitRps: metrics.hitRps } : {}),
    ...(metrics?.missRps !== undefined ? { missRps: metrics.missRps } : {}),
    ...(metrics?.hitRate !== undefined ? { hitRate: metrics.hitRate } : {}),
    ...(metrics?.capacityRps !== undefined ? { capacityRps: metrics.capacityRps } : {}),
    ...(metrics?.utilization !== undefined ? { utilization: metrics.utilization } : {}),
    ...(metrics?.downstreamAvoidedRps !== undefined ? { downstreamAvoidedRps: metrics.downstreamAvoidedRps } : {}),
    ...(context.simulation?.available === true && context.simulation.scenarios?.hotKey
      ? { hotKey: context.simulation.scenarios.hotKey }
      : {}),
    coldCacheExperimentAvailable: metrics !== undefined,
    ...(metrics ? { metrics } : {}),
    ...(monthlyCost !== undefined ? { monthlyCost } : {}),
    ...(workloadFit ? { workloadFit } : {}),
  };
}

/**
 * Inspect one CDN or Redis cache component using trusted AgentContext evidence.
 * Does not invent cache metrics or expose cache mutation actions.
 */
export function inspectCache(
  context: AgentContext,
  input: InspectCacheInput = {},
): CapabilityResult<InspectCacheOutput> {
  const candidates = [
    ...componentsOfType(context.architecture.components, "cdn"),
    ...componentsOfType(context.architecture.components, "redis"),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const selection = selectComponentById(candidates, input.componentId, "CDN or Redis cache");
  if (!selection.ok) {
    return capabilityError(selection.code, selection.message);
  }

  const component = selection.component;
  return capabilityOk(
    buildOutput(
      context,
      component.id,
      component.type as "cdn" | "redis",
      component.config,
      compactDeployments(component.deployments),
    ),
  );
}

export const inspectCacheCapability: AgentCapability<
  AgentContext,
  InspectCacheInput,
  CapabilityResult<InspectCacheOutput>
> = {
  name: "inspect_cache",
  description:
    "Inspect one CDN or Redis cache: type, configuration, simulator hit/miss and capacity evidence, workload-fit (role, mechanism, ceiling, effective, pressures), downstream avoided RPS, hot-key evidence, cost, and cold-cache experiment availability. Provide componentId when multiple caches exist.",
  inputSchema: inspectCacheInputSchema,
  mode: "read",
  availableWhen: (context) =>
    context.architecture.components.some((component) => component.type === "cdn" || component.type === "redis"),
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context, input) {
    return inspectCache(context, input);
  },
};
