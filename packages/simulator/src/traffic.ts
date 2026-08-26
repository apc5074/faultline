import { ComponentRegistry } from "@faultline/component-catalog";
import type { Architecture, ChallengeDefinition, JsonObject } from "@faultline/core";

import {
  validateArchitectureForSimulation,
  type SimulationValidationError,
} from "./validation.js";

export interface ComponentTraffic {
  incomingRps: number;
  outgoingRps: number;
  readRps: number;
  writeRps: number;
}

export interface SimulationEvent {
  type:
    | "simulation_started"
    | "traffic_routed"
    | "component_load_changed"
    | "component_warning"
    | "component_saturated"
    | "requirement_passed"
    | "requirement_failed"
    | "simulation_finished";
  connectionId?: string;
  componentId?: string;
  data: Readonly<Record<string, number | string>>;
}

export interface TrafficPropagationInput {
  architecture: unknown;
  challenge: ChallengeDefinition;
  registry: ComponentRegistry;
}

export type TrafficPropagationResult =
  | {
      valid: true;
      traffic: Readonly<Record<string, ComponentTraffic>>;
      events: readonly SimulationEvent[];
    }
  | { valid: false; errors: readonly SimulationValidationError[] };

function createTraffic(): ComponentTraffic {
  return { incomingRps: 0, outgoingRps: 0, readRps: 0, writeRps: 0 };
}

function stableById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function requestEdgesFrom(architecture: Architecture, componentId: string) {
  return stableById(
    architecture.connections.filter(
      (connection) => connection.sourceComponentId === componentId && connection.type === "request",
    ),
  );
}

function databaseEdgesFrom(architecture: Architecture, componentId: string) {
  return stableById(
    architecture.connections.filter(
      (connection) => connection.sourceComponentId === componentId && connection.type === "read_write",
    ),
  );
}

function forwardsRequests(simulation: JsonObject | undefined): boolean {
  return simulation?.forwardsRequests === true;
}

/**
 * Propagates configured workload through the architecture graph.
 * Deterministic flow model only — not capacity or latency.
 *
 * Request passthrough components (Global Router, later Load Balancer) forward
 * incoming request RPS equally across outbound request edges without geographic bias.
 */
export function propagateTraffic({ architecture: input, challenge, registry }: TrafficPropagationInput): TrafficPropagationResult {
  const validation = validateArchitectureForSimulation({ architecture: input, challenge, registry });
  if (!validation.valid) return validation;

  const architecture = validation.architecture;
  const traffic = Object.fromEntries(
    stableById(architecture.components).map((component) => [component.id, createTraffic()]),
  ) as Record<string, ComponentTraffic>;
  const events: SimulationEvent[] = [{ type: "simulation_started", data: { requestsPerSecond: challenge.workload.requestsPerSecond } }];
  const sources = stableById(architecture.components.filter((component) => component.type === "traffic-source"));
  const workloadPerSource = challenge.workload.requestsPerSecond / sources.length;

  for (const source of sources) {
    const edges = requestEdgesFrom(architecture, source.id);
    const trafficPerEdge = workloadPerSource / edges.length;
    traffic[source.id].outgoingRps += workloadPerSource;

    for (const edge of edges) {
      traffic[edge.targetComponentId].incomingRps += trafficPerEdge;
      events.push({
        type: "traffic_routed",
        connectionId: edge.id,
        componentId: edge.targetComponentId,
        data: { requestsPerSecond: trafficPerEdge, kind: "request" },
      });
    }
  }

  const forwarders = stableById(
    architecture.components.filter((component) => forwardsRequests(registry.get(component.type).simulation)),
  );
  // Bounded passes support chained passthroughs without pretending to be geographic routing.
  for (let pass = 0; pass < architecture.components.length; pass += 1) {
    let forwardedAny = false;
    for (const forwarder of forwarders) {
      const edges = requestEdgesFrom(architecture, forwarder.id);
      if (edges.length === 0) continue;
      const pendingRps = traffic[forwarder.id].incomingRps - traffic[forwarder.id].outgoingRps;
      if (pendingRps <= 0) continue;

      const trafficPerEdge = pendingRps / edges.length;
      traffic[forwarder.id].outgoingRps += pendingRps;
      forwardedAny = true;

      for (const edge of edges) {
        traffic[edge.targetComponentId].incomingRps += trafficPerEdge;
        events.push({
          type: "traffic_routed",
          connectionId: edge.id,
          componentId: edge.targetComponentId,
          data: { requestsPerSecond: trafficPerEdge, kind: "request" },
        });
      }
    }
    if (!forwardedAny) break;
  }

  for (const service of stableById(architecture.components.filter((component) => component.type === "service"))) {
    const edges = databaseEdgesFrom(architecture, service.id);
    if (edges.length === 0) continue;
    const totalRps = traffic[service.id].incomingRps;
    const readPerEdge = (totalRps * challenge.workload.readRatio) / edges.length;
    const writePerEdge = (totalRps * challenge.workload.writeRatio) / edges.length;
    traffic[service.id].outgoingRps += totalRps;

    for (const edge of edges) {
      const targetTraffic = traffic[edge.targetComponentId];
      targetTraffic.incomingRps += readPerEdge + writePerEdge;
      targetTraffic.readRps += readPerEdge;
      targetTraffic.writeRps += writePerEdge;
      events.push({
        type: "traffic_routed",
        connectionId: edge.id,
        componentId: edge.targetComponentId,
        data: { readRequestsPerSecond: readPerEdge, writeRequestsPerSecond: writePerEdge, kind: "read_write" },
      });
    }
  }

  events.push({ type: "simulation_finished", data: { requestsPerSecond: challenge.workload.requestsPerSecond } });
  return { valid: true, traffic, events };
}
