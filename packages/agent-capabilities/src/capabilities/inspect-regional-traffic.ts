import type { CostResult } from "@faultline/core";

import { architectureHasMultiRegionDeployments } from "../architecture-predicates.js";
import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import {
  crossRegionCostFacts,
  deploymentInventoryFromArchitecture,
  type AgentRegionalEvidence,
  type CrossRegionCostFact,
  type RegionalDeploymentEntry,
} from "../regional-evidence.js";
import { capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema } from "../schemas.js";

/** Compact multi-region traffic inspection for agent grounding. */
export interface InspectRegionalTrafficOutput {
  readonly regions: readonly string[];
  readonly deployments: readonly RegionalDeploymentEntry[];
  readonly simulationAvailable: boolean;
  readonly validationErrors?: readonly string[];
  readonly regionalTraffic?: AgentRegionalEvidence;
  readonly redirectP95Ms?: number;
  readonly crossRegionCosts?: readonly CrossRegionCostFact[];
}

function crossRegionCostsFromContext(cost: CostResult | undefined): readonly CrossRegionCostFact[] | undefined {
  if (!cost) return undefined;
  const facts = crossRegionCostFacts(cost);
  return facts.length > 0 ? facts : undefined;
}

/**
 * Inspect multi-region deployment inventory and shared simulator geographic evidence.
 * Does not recompute routing, latency, or transfer formulas.
 */
export function inspectRegionalTraffic(context: AgentContext): CapabilityResult<InspectRegionalTrafficOutput> {
  const inventory = deploymentInventoryFromArchitecture(context.architecture);
  const simulation = context.simulation;

  if (!simulation || simulation.available !== true) {
    const crossRegionCosts = crossRegionCostsFromContext(context.cost);
    return capabilityOk({
      ...inventory,
      simulationAvailable: false,
      validationErrors: simulation?.available === false ? simulation.validationErrors : ["Simulation evidence is not available."],
      ...(crossRegionCosts ? { crossRegionCosts } : {}),
    });
  }

  const crossRegionCosts = crossRegionCostsFromContext(context.cost);
  return capabilityOk({
    ...inventory,
    simulationAvailable: true,
    ...(simulation.regional ? { regionalTraffic: simulation.regional } : {}),
    ...(simulation.system?.redirectP95Ms !== undefined ? { redirectP95Ms: simulation.system.redirectP95Ms } : {}),
    ...(crossRegionCosts ? { crossRegionCosts } : {}),
  });
}

export const inspectRegionalTrafficCapability: AgentCapability<
  AgentContext,
  undefined,
  CapabilityResult<InspectRegionalTrafficOutput>
> = {
  name: "inspect_regional_traffic",
  description:
    "Inspect multi-region deployment inventory and simulator-derived geographic traffic: regional origins, routes, redirect p95 latency, and cross-region transfer/replication costs when available. Requires deployments in at least two regions.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: (context) => architectureHasMultiRegionDeployments(context.architecture),
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context) {
    return inspectRegionalTraffic(context);
  },
};
