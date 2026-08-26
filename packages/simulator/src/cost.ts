import {
  cdnMonthlyCostForConfig,
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

export class CostEstimationError extends Error {
  override name = "CostEstimationError";
}

export interface CostEstimationInput {
  architecture: Architecture;
  registry: ComponentRegistry;
  /**
   * Optional per-component traffic used for usage-priced components (CDN).
   * When omitted, CDN contributes tier base cost only.
   */
  traffic?: Readonly<Record<string, { readonly incomingRps: number }>>;
  /**
   * Optional geographic routes from a successful simulation.
   * When present, cross-region byte transfer and replication enter CostResult.
   */
  geographicRoutes?: readonly GeographicRoute[];
  /** Challenge workload ratios + transferPayload for transfer projection. */
  challenge?: Pick<ChallengeDefinition, "workload" | "transferPayload">;
}

function priceComponent(
  component: ComponentInstance,
  registry: ComponentRegistry,
  traffic: CostEstimationInput["traffic"],
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
    return { componentId: component.id, amount: serviceMonthlyCostForConfig(configResult.data as ServiceConfig) };
  }
  if (component.type === "postgres") {
    return { componentId: component.id, amount: postgresMonthlyCostForConfig(configResult.data as PostgresConfig) };
  }
  if (component.type === "redis") {
    return { componentId: component.id, amount: redisMonthlyCostForConfig(configResult.data as RedisConfig) };
  }
  if (component.type === "cdn") {
    const incomingRps = traffic?.[component.id]?.incomingRps ?? 0;
    return {
      componentId: component.id,
      amount: cdnMonthlyCostForConfig(configResult.data as CdnConfig, incomingRps),
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
    const lineItem = priceComponent(component, registry, traffic);
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
