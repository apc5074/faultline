import {
  postgresTierModels,
  serviceMonthlyCostPerInstance,
  ComponentRegistry,
  type PostgresConfig,
  type ServiceConfig,
} from "@faultline/component-catalog";
import {
  parseArchitecture,
  type Architecture,
  type ComponentInstance,
  type CostLineItem,
  type CostResult,
} from "@faultline/core";

export class CostEstimationError extends Error {
  override name = "CostEstimationError";
}

export interface CostEstimationInput {
  architecture: Architecture;
  registry: ComponentRegistry;
}

function priceComponent(component: ComponentInstance, registry: ComponentRegistry): CostLineItem | null {
  if (!registry.has(component.type)) {
    throw new CostEstimationError(`Component "${component.id}" uses unknown type "${component.type}" and cannot be priced.`);
  }

  const definition = registry.get(component.type);
  const configResult = definition.configSchema.safeParse(component.config);
  if (!configResult.success) {
    throw new CostEstimationError(`Component "${component.id}" has invalid ${definition.label} configuration and cannot be priced.`);
  }

  if (component.type === "traffic-source") return null;
  if (component.type === "service") {
    return { componentId: component.id, amount: (configResult.data as ServiceConfig).instances * serviceMonthlyCostPerInstance };
  }
  if (component.type === "postgres") {
    const model = postgresTierModels[(configResult.data as PostgresConfig).tier];
    if (!model) throw new CostEstimationError(`Component "${component.id}" has an unpriceable Postgres tier.`);
    return { componentId: component.id, amount: model.monthlyCost };
  }

  throw new CostEstimationError(`Component "${component.id}" of type "${component.type}" has no Phase 1 cost model.`);
}

/** Simplified educational monthly infrastructure estimate from canonical state. */
export function estimateMonthlyCost({ architecture: input, registry }: CostEstimationInput): CostResult {
  const architecture = parseArchitecture(input);
  const lineItems = architecture.components.flatMap((component) => {
    const lineItem = priceComponent(component, registry);
    return lineItem ? [lineItem] : [];
  });
  return { monthlyTotal: lineItems.reduce((total, lineItem) => total + lineItem.amount, 0), lineItems };
}
