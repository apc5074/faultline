import { componentRegistry } from "@faultline/component-catalog";
import { checkConnectionCompatibility, type Architecture, type ComponentDefinition, type ComponentInstance, type Connection as ArchitectureConnection } from "@faultline/core";

import { buildLevel1HeroScene, isLevel1HeroSceneEnabled } from "@/features/architecture-canvas/level1-hero-scene";
import type { FlowConnectionLike } from "@/features/architecture-canvas/playground-types";
import type { WorldMapSelection } from "@/features/world-map/WorldMap";

const emptyStarterArchitecture: Architecture = {
  version: 1,
  components: [
    {
      id: "traffic-source-start",
      type: "traffic-source",
      config: { label: "Incoming traffic" },
      deployments: [],
      ui: { x: 80, y: 180 },
    },
  ],
  connections: [],
};

export function resolveInitialArchitecture(): Architecture {
  return isLevel1HeroSceneEnabled() ? buildLevel1HeroScene() : emptyStarterArchitecture;
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
