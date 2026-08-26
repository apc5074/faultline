import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture, ComponentInstance } from "@faultline/core";

import {
  catalogTypeToSimType,
  type SimComponent,
  type SimConnection,
  type SimPacket,
} from "./sim-types";

function readInstances(component: ComponentInstance): number {
  if (component.type === "service") {
    const parsed = componentRegistry.get("service").configSchema.safeParse(component.config);
    if (parsed.success) return Math.max(1, Number(parsed.data.instances) || 1);
  }
  return 1;
}

function readLbAlgorithm(component: ComponentInstance): SimComponent["algorithm"] {
  if (component.type !== "load-balancer") return "round-robin";
  const parsed = componentRegistry.get("load-balancer").configSchema.safeParse(component.config);
  if (!parsed.success) return "round-robin";
  return parsed.data.policy === "equal" ? "round-robin" : "least-connections";
}

function readReplicas(component: ComponentInstance): number {
  if (component.type !== "postgres") return 0;
  const parsed = componentRegistry.get("postgres").configSchema.safeParse(component.config);
  if (!parsed.success) return 0;
  return Math.max(0, Number(parsed.data.readReplicaCount) || 0);
}

export function buildSimGraph(architecture: Architecture): {
  components: SimComponent[];
  connections: SimConnection[];
} {
  const components: SimComponent[] = [];

  for (const component of architecture.components) {
    const simType = catalogTypeToSimType(component.type);
    if (!simType) continue;

    const definition = componentRegistry.get(component.type);
    const inputPorts = definition.ports
      .filter((port) => port.direction === "input")
      .map((port) => ({ id: port.id }));
    const outputPorts = definition.ports
      .filter((port) => port.direction === "output")
      .map((port) => ({ id: port.id }));

    components.push({
      id: component.id,
      type: simType,
      state: "idle",
      instances: readInstances(component),
      capacity: 16,
      depth: 8,
      replicas: readReplicas(component),
      algorithm: readLbAlgorithm(component),
      inputPorts,
      outputPorts,
      processingPackets: [],
      armAngle: 0,
      passCount: 0,
    });
  }

  const simComponentIds = new Set(components.map((component) => component.id));
  const connections: SimConnection[] = architecture.connections
    .filter(
      (connection) =>
        simComponentIds.has(connection.sourceComponentId) &&
        simComponentIds.has(connection.targetComponentId),
    )
    .map((connection) => ({
      id: connection.id,
      fromComponentId: connection.sourceComponentId,
      fromPortId: connection.sourcePortId,
      toComponentId: connection.targetComponentId,
      toPortId: connection.targetPortId,
      load: 0,
    }));

  return { components, connections };
}

export function mergeSimVisuals(
  graph: ReturnType<typeof buildSimGraph>,
  tickResult: { components: SimComponent[]; connections: SimConnection[]; packets: SimPacket[] },
) {
  return {
    packets: tickResult.packets,
    edgeLoads: tickResult.connections.map((connection) => ({
      connectionId: connection.id,
      weight: connection.load,
    })),
    componentVisuals: tickResult.components.map((component) => ({
      componentId: component.id,
      processingCount: component.mechanismCount ?? component.processingPackets.length,
      armAngle: component.armAngle,
      passCount: component.passCount,
      state: component.state,
      cacheHitFlash: component.cacheHitFlash,
      writeBands: component.writeBands,
    })),
  };
}
