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
  readonly monthlyCost?: number;
}

function monthlyCostForComponent(cost: CostResult | undefined, componentId: string): number | undefined {
  if (!cost) return undefined;
  const amount = cost.lineItems
    .filter((item) => item.componentId === componentId)
    .reduce((sum, item) => sum + item.amount, 0);
  return cost.lineItems.some((item) => item.componentId === componentId) ? amount : undefined;
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
  return {
    componentId: component.id,
    config: component.config,
    ...buildTopology(component),
    ...(readDistribution ? { readDistribution } : {}),
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
    "Inspect one Postgres replication topology: primary/replica placement, replica count, read distribution from simulation when available, and monthly cost when available. Omit componentId when only one replicated Postgres exists.",
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
