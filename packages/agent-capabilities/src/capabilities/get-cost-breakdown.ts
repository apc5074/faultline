import type { CostLineItem } from "@faultline/core";

import type { AgentCapability } from "../capability.js";
import type { AgentContext, EvidenceMeta } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema } from "../schemas.js";

/** One authoritative monthly cost item, labeled from CostResult or canonical Architecture. */
export interface CostBreakdownLineItem {
  readonly componentId: string;
  readonly label: string;
  readonly monthlyCost: number;
}

/** Compact cost evidence for an agent to reason about the active challenge budget. */
export interface GetCostBreakdownOutput {
  readonly monthlyTotal: number;
  readonly budget: number;
  readonly remainingBudget: number;
  readonly overBudget: boolean;
  readonly lineItems: readonly CostBreakdownLineItem[];
  readonly evidence?: EvidenceMeta;
}

function lineItemLabel(context: AgentContext, lineItem: CostLineItem): string {
  if (lineItem.label) return lineItem.label;
  const component = context.architecture.components.find((candidate) => candidate.id === lineItem.componentId);
  return component?.type ?? lineItem.componentId;
}

function compactLineItems(context: AgentContext): readonly CostBreakdownLineItem[] {
  const cost = context.cost;
  if (!cost) return [];

  return [...cost.lineItems]
    .sort((left, right) => left.componentId.localeCompare(right.componentId))
    .map((lineItem) => ({
      componentId: lineItem.componentId,
      label: lineItemLabel(context, lineItem),
      monthlyCost: lineItem.amount,
    }));
}

/**
 * Present CostResult facts without estimating or recalculating infrastructure pricing.
 */
export function getCostBreakdown(context: AgentContext): CapabilityResult<GetCostBreakdownOutput> {
  if (!context.cost) {
    return capabilityError("SIMULATION_UNAVAILABLE", "Cost evidence is not available.");
  }

  const budget = context.challenge.monthlyBudget;
  const monthlyTotal = context.cost.monthlyTotal;
  return capabilityOk({
    monthlyTotal,
    budget,
    remainingBudget: budget - monthlyTotal,
    overBudget: monthlyTotal > budget,
    lineItems: compactLineItems(context),
    ...(context.evidenceMeta ? { evidence: context.evidenceMeta } : {}),
  });
}

export const getCostBreakdownCapability: AgentCapability<
  AgentContext,
  undefined,
  CapabilityResult<GetCostBreakdownOutput>
> = {
  name: "get_cost_breakdown",
  description:
    "Return the authoritative monthly cost total, challenge budget, remaining budget, and compact cost line items. Does not estimate provider pricing.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context) {
    return getCostBreakdown(context);
  },
};
