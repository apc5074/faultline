import {
  cdnMonthlyCostForConfig,
  cdnUsageMonthlyCost,
  objectStorageMonthlyBaseCostForConfig,
  objectStorageModelForConfig,
  loadBalancerMonthlyCost,
  postgresMonthlyCostForConfig,
  redisMonthlyCostForConfig,
  serviceMonthlyCostForConfig,
  queueMonthlyCostForConfig,
  workerMonthlyCostForConfig,
  ComponentRegistry,
  type CdnConfig,
  type PostgresConfig,
  type RedisConfig,
  type ServiceConfig,
  type QueueConfig,
  type WorkerConfig,
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
import type { Level2SimulationResult } from "./level2.js";
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
  level2?: Level2SimulationResult;
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
  level2: CostEstimationInput["level2"],
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
    // Every regional deployment is an independent cache footprint. An empty
    // deployments list is the legacy logical single-footprint form.
    const footprintCount = Math.max(1, component.deployments.length);
    return {
      componentId: component.id,
      amount: redisMonthlyCostForConfig(configResult.data as RedisConfig) * footprintCount,
    };
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
  if (component.type === "object-storage") {
    const config = configResult.data as { tier: "standard" | "high-throughput" };
    const evidence = level2?.objectStorage[component.id];
    const model = objectStorageModelForConfig(config);
    const storedGb = (evidence?.storedBytes ?? 0) / 1_000_000_000;
    const monthlyOriginGb = ((evidence?.originReadThroughputBytesPerSecond ?? 0) * 2_592_000) / 1_000_000_000;
    const monthlyRequests = ((evidence?.uploadThroughputBytesPerSecond ?? 0) > 0 ? 1 : 0) * 2_592_000 / 1_000_000;
    return {
      componentId: component.id,
      amount: Math.round(objectStorageMonthlyBaseCostForConfig(config) + storedGb * model.storageCostPerGbMonth + monthlyRequests * model.requestCostPerMillion + monthlyOriginGb * model.originTransferCostPerGb),
    };
  }
  if (component.type === "queue") {
    return { componentId: component.id, amount: queueMonthlyCostForConfig(configResult.data as QueueConfig) };
  }
  if (component.type === "worker") {
    return { componentId: component.id, amount: workerMonthlyCostForConfig(configResult.data as WorkerConfig) };
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
  level2,
}: CostEstimationInput): CostResult {
  const architecture = parseArchitecture(input);
  const componentItems = architecture.components.flatMap((component) => {
    const lineItem = priceComponent(component, registry, traffic, challenge, level2);
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
