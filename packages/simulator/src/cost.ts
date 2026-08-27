import {
  cdnMonthlyCostForConfig,
  cdnUsageMonthlyCost,
  loadBalancerMonthlyCost,
  postgresMonthlyCostForConfig,
  redisMonthlyCostForConfig,
  serviceMonthlyCostForConfig,
  ComponentRegistry,
  type CdnConfig,
  type PostgresConfig,
  type RedisConfig,
  type ServiceConfig,
} from "@faultline/component-catalog";
import {
  parseArchitecture,
  type Architecture,
  type ChallengeDefinition,
  type ComponentInstance,
  type CostLineItem,
  type CostResult,
} from "@faultline/core";

import type { GeographicRoute } from "./geographic-routing.js";
import { estimateCrossRegionTransferCost } from "./transfer-cost.js";
import { mechanismIdForCatalogType, resolveMechanismAffinity } from "./workload-affinity.js";

export class CostEstimationError extends Error {
  override name = "CostEstimationError";
}

export interface CostEstimationInput {
  architecture: Architecture;
  registry: ComponentRegistry;
  /**
   * Optional per-component traffic used for usage-priced components (CDN) and
   * ACTIVE-work unit-cost pressure (Postgres/Service/CDN usage lines).
   */
  traffic?: Readonly<
    Record<string, { readonly incomingRps: number; readonly readRps?: number; readonly writeRps?: number }>
  >;
  /**
   * Optional geographic routes from a successful simulation.
   * When present, cross-region byte transfer and replication enter CostResult.
   */
  geographicRoutes?: readonly GeographicRoute[];
  /** Challenge workload ratios + transferPayload for transfer projection. */
  challenge?: Pick<ChallengeDefinition, "workload" | "transferPayload" | "workloadAffinity">;
}

function handledRpsForCost(
  component: ComponentInstance,
  traffic: CostEstimationInput["traffic"],
): number {
  const sample = traffic?.[component.id];
  if (!sample) return 0;
  if (component.type === "postgres") return (sample.readRps ?? 0) + (sample.writeRps ?? 0);
  return sample.incomingRps ?? 0;
}

/** Usage-cost multiplier for ACTIVE handled work; idle/unreachable nodes stay at 1.0. */
function unitCostPressureForComponent(
  component: ComponentInstance,
  challenge: CostEstimationInput["challenge"],
  traffic: CostEstimationInput["traffic"],
): number {
  if (!challenge?.workloadAffinity) return 1;
  const handledRps = handledRpsForCost(component, traffic);
  if (handledRps <= 0) return 1;
  const mechanismId = mechanismIdForCatalogType(component.type);
  if (mechanismId === null) return 1;
  return resolveMechanismAffinity(challenge as ChallengeDefinition, mechanismId).unitCostPressure ?? 1;
}

function priceComponent(
  component: ComponentInstance,
  registry: ComponentRegistry,
  traffic: CostEstimationInput["traffic"],
  challenge: CostEstimationInput["challenge"],
): CostLineItem | null {
  if (!registry.has(component.type)) {
    throw new CostEstimationError(`Component "${component.id}" uses unknown type "${component.type}" and cannot be priced.`);
  }

  const definition = registry.get(component.type);
  const configResult = definition.configSchema.safeParse(component.config);
  if (!configResult.success) {
    throw new CostEstimationError(`Component "${component.id}" has invalid ${definition.label} configuration and cannot be priced.`);
  }

  if (component.type === "traffic-source") return null;
  if (component.type === "global-router") return null;
  if (component.type === "load-balancer") {
    return { componentId: component.id, amount: loadBalancerMonthlyCost };
  }
  if (component.type === "service") {
    const pressure = unitCostPressureForComponent(component, challenge, traffic);
    return {
      componentId: component.id,
      amount: Math.round(serviceMonthlyCostForConfig(configResult.data as ServiceConfig) * pressure),
    };
  }
  if (component.type === "postgres") {
    const pressure = unitCostPressureForComponent(component, challenge, traffic);
    return {
      componentId: component.id,
      amount: Math.round(postgresMonthlyCostForConfig(configResult.data as PostgresConfig) * pressure),
    };
  }
  if (component.type === "redis") {
    return { componentId: component.id, amount: redisMonthlyCostForConfig(configResult.data as RedisConfig) };
  }
  if (component.type === "cdn") {
    const incomingRps = traffic?.[component.id]?.incomingRps ?? 0;
    const config = configResult.data as CdnConfig;
    const base = cdnMonthlyCostForConfig(config, 0);
    const usage = cdnUsageMonthlyCost(incomingRps);
    const pressure = unitCostPressureForComponent(component, challenge, traffic);
    return {
      componentId: component.id,
      amount: base + Math.round(usage * pressure),
    };
  }

  throw new CostEstimationError(`Component "${component.id}" of type "${component.type}" has no cost model.`);
}

/** Simplified educational monthly infrastructure estimate from canonical state. */
export function estimateMonthlyCost({
  architecture: input,
  registry,
  traffic,
  geographicRoutes,
  challenge,
}: CostEstimationInput): CostResult {
  const architecture = parseArchitecture(input);
  const componentItems = architecture.components.flatMap((component) => {
    const lineItem = priceComponent(component, registry, traffic, challenge);
    return lineItem ? [lineItem] : [];
  });
  const transferItems = estimateCrossRegionTransferCost({
    architecture,
    challenge,
    geographicRoutes,
  });
  const lineItems = [...componentItems, ...transferItems];
  return { monthlyTotal: lineItems.reduce((total, lineItem) => total + lineItem.amount, 0), lineItems };
}
