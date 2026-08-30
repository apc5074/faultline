import type {
  Architecture,
  ComponentInstance,
  Connection,
  JsonObject,
  RegionDeployment,
} from "@faultline/core";

import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema } from "../schemas.js";

/** Compact regional deployment facts that affect engineering outcomes. */
export interface CompactDeployment {
  readonly id: string;
  readonly regionId: string;
  readonly config: JsonObject;
}

/** Compact component view: identity, type, config, deployments — no UI. */
export interface CompactComponent {
  readonly id: string;
  readonly type: string;
  readonly config: JsonObject;
  readonly deployments?: readonly CompactDeployment[];
}

/** Compact connection view for agent grounding. */
export interface CompactConnection {
  readonly source: string;
  readonly target: string;
  readonly type: Connection["type"];
}

export interface GetArchitectureOutput {
  readonly components: readonly CompactComponent[];
  readonly connections: readonly CompactConnection[];
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function compactDeployment(deployment: RegionDeployment): CompactDeployment {
  return {
    id: deployment.id,
    regionId: deployment.regionId,
    config: deployment.config,
  };
}

function compactComponent(component: ComponentInstance): CompactComponent {
  const deployments = [...component.deployments].sort(byId).map(compactDeployment);
  return {
    id: component.id,
    type: component.type,
    config: component.config,
    ...(deployments.length > 0 ? { deployments } : {}),
  };
}

function compactConnection(connection: Connection): CompactConnection {
  return {
    source: connection.sourceComponentId,
    target: connection.targetComponentId,
    type: connection.type,
  };
}

/**
 * Project canonical Architecture into a compact semantic view.
 * Omits UI-only noise; preserves config, deployments, and connections.
 */
export function buildGetArchitectureOutput(architecture: Architecture): GetArchitectureOutput {
  return {
    components: [...architecture.components].sort(byId).map(compactComponent),
    connections: [...architecture.connections]
      .sort(byId)
      .map(compactConnection),
  };
}

export const getArchitectureCapability: AgentCapability<
  AgentContext,
  undefined,
  CapabilityResult<GetArchitectureOutput>
> = {
  name: "get_architecture",
  description:
    "Inspect the player's current architecture only when targeted evidence cannot establish a required path: components, config, regional deployments, and connections. Omits UI layout noise.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context) {
    return capabilityOk(buildGetArchitectureOutput(context.architecture));
  },
};
