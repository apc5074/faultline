import { componentRegistry } from "@faultline/component-catalog";
import { checkConnectionCompatibility, validateArchitecture, type Architecture, type ChallengeDefinition, type ComponentDefinition, type ComponentInstance, type Connection as ArchitectureConnection } from "@faultline/core";

import { buildLevel1HeroScene, isLevel1HeroSceneEnabled } from "@/features/architecture-canvas/level1-hero-scene";
import { activeLevelStarterArchitecture } from "@/features/architecture-canvas/playground-challenge";
import type { FlowConnectionLike } from "@/features/architecture-canvas/playground-types";
import type { WorldMapSelection } from "@/features/world-map/WorldMap";

export function resolveInitialArchitecture(): Architecture {
  return isLevel1HeroSceneEnabled() ? buildLevel1HeroScene() : activeLevelStarterArchitecture();
}

export function playgroundDraftStorageKey(slug: string, version: number): string {
  return `faultline:draft:v1:${slug}:${version}`;
}

const UUID_SUFFIX_PATTERN = /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasUuidSuffix(id: string): boolean {
  return UUID_SUFFIX_PATTERN.test(id);
}

/** Rewrites legacy `type-<uuid>` canvas ids to sequential `type-N` ids. */
export function migrateFriendlyArchitectureIds(architecture: Architecture): Architecture {
  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();

  for (const component of architecture.components) {
    if (!hasUuidSuffix(component.id)) usedIds.add(component.id);
  }
  for (const connection of architecture.connections) {
    if (!hasUuidSuffix(connection.id)) usedIds.add(connection.id);
  }

  for (const component of architecture.components) {
    if (!hasUuidSuffix(component.id)) continue;
    const prefix = component.id.replace(UUID_SUFFIX_PATTERN, "");
    const nextId = nextSequentialId(prefix, usedIds);
    idMap.set(component.id, nextId);
    usedIds.add(nextId);
  }

  for (const connection of architecture.connections) {
    if (!hasUuidSuffix(connection.id)) continue;
    const nextId = nextSequentialId("connection", usedIds);
    idMap.set(connection.id, nextId);
    usedIds.add(nextId);
  }

  if (idMap.size === 0) return architecture;

  return {
    ...architecture,
    components: architecture.components.map((component) => {
      const nextComponentId = idMap.get(component.id) ?? component.id;
      return {
        ...component,
        id: nextComponentId,
        deployments: component.deployments.map((deployment) => ({
          ...deployment,
          id: deployment.id.includes(component.id)
            ? deployment.id.replace(component.id, nextComponentId)
            : deployment.id,
        })),
      };
    }),
    connections: architecture.connections.map((connection) => ({
      ...connection,
      id: idMap.get(connection.id) ?? connection.id,
      sourceComponentId: idMap.get(connection.sourceComponentId) ?? connection.sourceComponentId,
      targetComponentId: idMap.get(connection.targetComponentId) ?? connection.targetComponentId,
    })),
  };
}

/** Restore only a validated local draft; official runs/results are never persisted here. */
export function loadPersistedArchitecture(slug: string, version: number): Architecture | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(playgroundDraftStorageKey(slug, version));
    if (!raw || raw.length > 1_000_000) return null;
    const envelope = JSON.parse(raw) as { version?: number; challenge?: { slug?: string; version?: number }; architecture?: unknown };
    if (envelope.version !== 1 || envelope.challenge?.slug !== slug || envelope.challenge.version !== version) return null;
    const result = validateArchitecture(envelope.architecture);
    return result.success ? migrateFriendlyArchitectureIds(result.data) : null;
  } catch {
    return null;
  }
}

export function persistArchitecture(architecture: Architecture, challenge: Pick<ChallengeDefinition, "slug" | "version">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      playgroundDraftStorageKey(challenge.slug, challenge.version),
      JSON.stringify({ version: 1, challenge: { slug: challenge.slug, version: challenge.version }, architecture }),
    );
  } catch {
    // Storage can be unavailable or full; gameplay remains fully local and playable.
  }
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

/** Allocates `prefix-1`, `prefix-2`, … skipping any IDs already on the canvas. */
export function nextSequentialId(prefix: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  let index = 1;
  while (taken.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

/** Player-facing label for a component; never exposes the internal id. */
export function componentDisplayLabel(
  architecture: Architecture,
  componentId: string,
): string {
  const component = architecture.components.find((candidate) => candidate.id === componentId);
  if (!component || !componentRegistry.has(component.type)) return "Unknown component";
  const definition = componentRegistry.get(component.type);
  if (component.type === "traffic-source") {
    const label = (component.config as { label?: string }).label?.trim();
    if (label) return label;
  }
  const siblings = architecture.components.filter((candidate) => candidate.type === component.type);
  if (siblings.length <= 1) return definition.label;
  const ordinal = siblings.findIndex((candidate) => candidate.id === componentId) + 1;
  return `${definition.label} ${ordinal}`;
}

export function createComponentInstance(
  definition: ComponentDefinition,
  position: { x: number; y: number },
  existingIds: Iterable<string> = [],
): ComponentInstance {
  const parsedConfig = definition.configSchema.safeParse(structuredClone(definition.defaultConfig));
  if (!parsedConfig.success) throw new Error(`Default configuration for ${definition.type} is invalid.`);

  return {
    id: nextSequentialId(definition.type, existingIds),
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
  existingIds: Iterable<string> = [],
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
    id: nextSequentialId(definition.type, existingIds),
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
  const canonicalConnection = connectionFromFlow(
    connection,
    architecture.components,
    architecture.connections.map((entry) => entry.id),
  );
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
  existingConnectionIds: Iterable<string> = [],
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
    id: nextSequentialId("connection", existingConnectionIds),
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
  const usedConnectionIds = new Set(architecture.connections.map((connection) => connection.id));

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
        usedConnectionIds,
      );
      if (!replacement) continue;

      const key = `${replacement.sourceComponentId}:${replacement.sourcePortId}->${replacement.targetComponentId}:${replacement.targetPortId}:${replacement.type}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      usedConnectionIds.add(replacement.id);
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
