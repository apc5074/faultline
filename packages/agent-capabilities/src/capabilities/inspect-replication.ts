import {
  postgresPrimaryDeployment,
  postgresReplicaDeployments,
  type CostResult,
  type JsonObject,
} from "@faultline/core";

import { architectureHasPostgresReplica } from "../architecture-predicates.js";
import type { AgentCapability } from "../capability.js";
import {
  compactDeployments,
  postgresComponentsWithReplicas,
  selectComponentById,
  type CompactDeployment,
} from "../component-selection.js";
import type { AgentContext, AgentSimulationEvidence } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { inspectReplicationInputSchema, type InspectReplicationInput } from "../schemas.js";

export interface ReplicationPrimaryPlacement {
  readonly deploymentId: string;
  readonly regionId: string;
}

/** Compact Postgres replication inspection for agent grounding. */
export interface InspectReplicationOutput {
  readonly componentId: string;
  readonly config: JsonObject;
  readonly replicaCount: number;
  readonly primary?: ReplicationPrimaryPlacement;
  readonly replicas?: readonly CompactDeployment[];
  readonly readDistribution?: Readonly<Record<string, number>>;
  readonly replicaCostFacts?: readonly { readonly amount: number; readonly label?: string }[];
  readonly semantics: {
    readonly replicationLagSimulated: false;
    readonly primaryPromotionSimulated: false;
    readonly failoverHealthEvaluated: false;
  };
  readonly monthlyCost?: number;
}

function monthlyCostForComponent(cost: CostResult | undefined, componentId: string): number | undefined {
  if (!cost) return undefined;
  const amount = cost.lineItems
    .filter((item) => item.componentId === componentId)
    .reduce((sum, item) => sum + item.amount, 0);
  return cost.lineItems.some((item) => item.componentId === componentId) ? amount : undefined;
}

function replicaCostFacts(cost: CostResult | undefined, componentId: string) {
  if (!cost) return undefined;
  const facts = cost.lineItems
    .filter((item) => item.componentId === componentId)
    .map((item) => ({ amount: item.amount, ...(item.label !== undefined ? { label: item.label } : {}) }));
  return facts.length > 0 ? facts : undefined;
}

function readDistributionForComponent(
  simulation: AgentSimulationEvidence | undefined,
  componentId: string,
): Readonly<Record<string, number>> | undefined {
  if (!simulation || simulation.available !== true) return undefined;
  const evidence = simulation.components[componentId];
  if (!evidence) return undefined;

  const distribution: Record<string, number> = {};
  const metricNames = [
    "readRps",
    "primaryReadRps",
    "replicaReadRps",
    "readUtilization",
    "writeUtilization",
    "readReplicaCount",
  ] as const;
  for (const name of metricNames) {
    const value = evidence.metrics[name];
    if (typeof value === "number" && Number.isFinite(value)) {
      distribution[name] = value;
    }
  }
  return Object.keys(distribution).length > 0 ? distribution : undefined;
}

function logicalReplicaCount(config: JsonObject): number {
  const readReplicaCount = config.readReplicaCount;
  return typeof readReplicaCount === "number" && readReplicaCount > 0 ? readReplicaCount : 0;
}

function buildTopology(component: { readonly id: string; readonly config: JsonObject; readonly deployments: readonly { readonly id: string; readonly regionId: string; readonly config: JsonObject }[] }) {
  if (component.deployments.length > 0) {
    const primary = postgresPrimaryDeployment(component.deployments);
    const replicas = compactDeployments(postgresReplicaDeployments(component.deployments));
    return {
      replicaCount: replicas.length,
      ...(primary
        ? {
            primary: {
              deploymentId: primary.id,
              regionId: primary.regionId,
            },
          }
        : {}),
      ...(replicas.length > 0 ? { replicas } : {}),
    };
  }

  return {
    replicaCount: logicalReplicaCount(component.config),
  };
}

function buildOutput(context: AgentContext, component: { readonly id: string; readonly config: JsonObject; readonly deployments: readonly { readonly id: string; readonly regionId: string; readonly config: JsonObject }[] }) {
  const readDistribution = readDistributionForComponent(context.simulation, component.id);
  const monthlyCost = monthlyCostForComponent(context.cost, component.id);
  const costFacts = replicaCostFacts(context.cost, component.id);
  return {
    componentId: component.id,
    config: component.config,
    ...buildTopology(component),
    ...(readDistribution ? { readDistribution } : {}),
    ...(costFacts ? { replicaCostFacts: costFacts } : {}),
    semantics: { replicationLagSimulated: false, primaryPromotionSimulated: false, failoverHealthEvaluated: false } as const,
    ...(monthlyCost !== undefined ? { monthlyCost } : {}),
  };
}

/**
 * Inspect one Postgres replication topology using trusted AgentContext evidence.
 * Does not invent replication lag or health decisions.
 */
export function inspectReplication(
  context: AgentContext,
  input: InspectReplicationInput = {},
): CapabilityResult<InspectReplicationOutput> {
  const selection = selectComponentById(
    postgresComponentsWithReplicas(context.architecture.components),
    input.componentId,
    "Postgres replica",
  );
  if (!selection.ok) {
    return capabilityError(selection.code, selection.message);
  }

  const component = selection.component;
  return capabilityOk(buildOutput(context, component));
}

export const inspectReplicationCapability: AgentCapability<
  AgentContext,
  InspectReplicationInput,
  CapabilityResult<InspectReplicationOutput>
> = {
  name: "inspect_replication",
  description:
    "Inspect one Postgres replication topology: canonical primary/replica placement, configured count, simulator-derived read routing, and cost facts. Explicitly reports that Phase 8 does not simulate lag, promotion, or failover health. Omit componentId when only one replicated Postgres exists.",
  inputSchema: inspectReplicationInputSchema,
  mode: "read",
  availableWhen: (context) => architectureHasPostgresReplica(context.architecture),
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context, input) {
    return inspectReplication(context, input);
  },
};
