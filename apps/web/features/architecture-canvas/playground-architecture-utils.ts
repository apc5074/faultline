import { componentRegistry } from "@faultline/component-catalog";
import { checkConnectionCompatibility, type Architecture, type ComponentDefinition, type ComponentInstance, type Connection as ArchitectureConnection } from "@faultline/core";

import { buildLevel1HeroScene, isLevel1HeroSceneEnabled } from "@/features/architecture-canvas/level1-hero-scene";
import { activeLevelStarterArchitecture } from "@/features/architecture-canvas/playground-challenge";
import type { FlowConnectionLike } from "@/features/architecture-canvas/playground-types";
import type { WorldMapSelection } from "@/features/world-map/WorldMap";

export function resolveInitialArchitecture(): Architecture {
  return isLevel1HeroSceneEnabled() ? buildLevel1HeroScene() : activeLevelStarterArchitecture();
}

/** Simulation-relevant architecture fingerprint; UI position changes do not invalidate results. */
export function architectureSimulationKey(architecture: Architecture): string {
  return JSON.stringify({
    components: architecture.components.map((component) => ({
      id: component.id,
      type: component.type,
      config: component.config,
    })),
    connections: architecture.connections,
  });
}

export function createComponentInstance(
  definition: ComponentDefinition,
  position: { x: number; y: number },
): ComponentInstance {
  const parsedConfig = definition.configSchema.safeParse(structuredClone(definition.defaultConfig));
  if (!parsedConfig.success) throw new Error(`Default configuration for ${definition.type} is invalid.`);

  return {
    id: `${definition.type}-${crypto.randomUUID()}`,
    type: definition.type,
    config: parsedConfig.data,
    deployments: [],
    ui: position,
  };
}

/** User-added components start as the smallest logical, non-regional option. */
export function createDroppedComponentInstance(
  definition: ComponentDefinition,
  position: { x: number; y: number },
): ComponentInstance {
  const config = {
    ...structuredClone(definition.defaultConfig),
    ...(definition.type === "service"
      ? { size: "small", instances: 1 }
      : definition.type === "redis"
        ? { mode: "standalone", tier: "small", ttlBand: "short" }
        : definition.type === "cdn"
          ? { coverage: 0, ttlBand: "short", tier: "small" }
          : definition.type === "postgres"
            ? { tier: "small", readReplicaCount: 0 }
            : definition.type === "worker"
              ? { size: "standard", instances: 1 }
              : definition.type === "queue"
                ? { capacityTier: "small" }
                : {}),
  };
  const parsedConfig = definition.configSchema.safeParse(config);
  if (!parsedConfig.success) throw new Error(`Default configuration for ${definition.type} is invalid.`);

  return {
    id: `${definition.type}-${crypto.randomUUID()}`,
    type: definition.type,
    config: parsedConfig.data,
    deployments: [],
    ui: position,
  };
}

export type ConnectionCreateResult =
  | { ok: true; connection: ArchitectureConnection }
  | { ok: false; reason: string };

export function connectionCreateResult(
  connection: FlowConnectionLike,
  architecture: Architecture,
): ConnectionCreateResult {
  const canonicalConnection = connectionFromFlow(connection, architecture.components);
  if (!canonicalConnection) {
    return {
      ok: false,
      reason: "That connection is not compatible. Connect an output to a matching input.",
    };
  }

  const isDuplicate = architecture.connections.some(
    (existing) =>
      existing.sourceComponentId === canonicalConnection.sourceComponentId &&
      existing.sourcePortId === canonicalConnection.sourcePortId &&
      existing.targetComponentId === canonicalConnection.targetComponentId &&
      existing.targetPortId === canonicalConnection.targetPortId &&
      existing.type === canonicalConnection.type,
  );
  if (isDuplicate) {
    return { ok: false, reason: "That connection already exists." };
  }

  return { ok: true, connection: canonicalConnection };
}

export function connectionFromFlow(
  connection: FlowConnectionLike,
  components: readonly ComponentInstance[],
): ArchitectureConnection | null {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return null;
  const source = components.find((component) => component.id === connection.source);
  const target = components.find((component) => component.id === connection.target);
  if (!source || !target || !componentRegistry.has(source.type) || !componentRegistry.has(target.type)) return null;

  const sourcePort = componentRegistry.get(source.type).ports.find((port) => port.id === connection.sourceHandle);
  const targetPort = componentRegistry.get(target.type).ports.find((port) => port.id === connection.targetHandle);
  if (!sourcePort || !targetPort) return null;

  const type = sourcePort.connectionTypes.find((candidate) => targetPort.connectionTypes.includes(candidate));
  if (!type || !checkConnectionCompatibility(sourcePort, targetPort, type).valid) return null;

  return {
    id: `connection-${crypto.randomUUID()}`,
    sourceComponentId: source.id,
    sourcePortId: sourcePort.id,
    targetComponentId: target.id,
    targetPortId: targetPort.id,
    type,
  };
}

/**
 * Preserve a path when its middle component is removed. Only matching
 * connection types are bridged, and normal connection validation still owns
 * the final compatibility check.
 */
export function reconnectAroundComponent(
  architecture: Architecture,
  componentId: string,
  connectionsBeforeDelete: readonly ArchitectureConnection[],
): ArchitectureConnection[] {
  const components = architecture.components.filter((component) => component.id !== componentId);
  const incoming = connectionsBeforeDelete.filter((connection) => connection.targetComponentId === componentId);
  const outgoing = connectionsBeforeDelete.filter((connection) => connection.sourceComponentId === componentId);
  const existingKeys = new Set(
    architecture.connections.map(
      (connection) =>
        `${connection.sourceComponentId}:${connection.sourcePortId}->${connection.targetComponentId}:${connection.targetPortId}:${connection.type}`,
    ),
  );
  const replacements: ArchitectureConnection[] = [];

  for (const inbound of incoming) {
    for (const outbound of outgoing) {
      if (inbound.type !== outbound.type) continue;
      const replacement = connectionFromFlow(
        {
          source: inbound.sourceComponentId,
          sourceHandle: inbound.sourcePortId,
          target: outbound.targetComponentId,
          targetHandle: outbound.targetPortId,
        },
        components,
      );
      if (!replacement) continue;

      const key = `${replacement.sourceComponentId}:${replacement.sourcePortId}->${replacement.targetComponentId}:${replacement.targetPortId}:${replacement.type}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      replacements.push(replacement);
    }
  }

  return replacements;
}

export function worldSelectionForComponent(
  architecture: Architecture,
  componentId: string | null,
): WorldMapSelection {
  if (!componentId) return null;
  const component = architecture.components.find((entry) => entry.id === componentId);
  const deployment = component?.deployments[0];
  if (!deployment) return null;
  return { kind: "deployment", componentId, deploymentId: deployment.id };
}

export function formatCost(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}
