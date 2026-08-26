import {
  postgresBaseP95LatencyMs,
  serviceBaseP95LatencyMs,
} from "@faultline/component-catalog";
import type { Architecture } from "@faultline/core";

import { evaluatePostgresCapacity, type PostgresCapacityMetrics } from "./postgres-capacity.js";
import { evaluateServiceCapacity, type ServiceCapacityMetrics } from "./service-capacity.js";
import type {
  SimulationEvent,
  TrafficPropagationInput,
  TrafficPropagationResult,
} from "./traffic.js";

export interface LatencyForUtilizationInput {
  baseLatencyMs: number;
  utilization: number;
}

export interface ComponentLatencyMetrics {
  utilization: number;
  baseLatencyMs: number;
  p95LatencyMs: number;
}

export interface PathLatencyBreakdown {
  serviceId: string;
  postgresId: string;
  serviceLatencyMs: number;
  postgresLatencyMs: number;
  pathLatencyMs: number;
}

export type PathLatencyResult =
  | (Extract<TrafficPropagationResult, { valid: true }> & {
      services: Readonly<Record<string, ServiceCapacityMetrics>>;
      postgres: Readonly<Record<string, PostgresCapacityMetrics>>;
      components: Readonly<Record<string, ComponentLatencyMetrics>>;
      paths: readonly PathLatencyBreakdown[];
      /**
       * Phase 1 request p95 is the worst Traffic→Service→Postgres path latency:
       * service pressure latency + database pressure latency.
       * Reads and writes share one DB pressure value; geographic latency is not modelled.
       */
      p95LatencyMs: number;
    })
  | Extract<TrafficPropagationResult, { valid: false }>;

/** Shared utilization bands that drive the educational latency curve. */
export const latencyUtilizationBands = {
  healthyMaximum: 0.7,
  warningMaximum: 0.9,
  criticalMaximum: 1,
} as const;

/**
 * Continuous piecewise pressure multiplier.
 * Healthy stays near base; warning rises moderately; critical rises rapidly;
 * overload becomes obviously unacceptable.
 */
function pressureMultiplier(utilization: number): number {
  if (utilization <= 0) return 1;
  if (utilization <= latencyUtilizationBands.healthyMaximum) {
    return 1 + 0.1 * (utilization / latencyUtilizationBands.healthyMaximum);
  }
  if (utilization <= latencyUtilizationBands.warningMaximum) {
    return (
      1.1 +
      0.4 *
        ((utilization - latencyUtilizationBands.healthyMaximum) /
          (latencyUtilizationBands.warningMaximum - latencyUtilizationBands.healthyMaximum))
    );
  }
  if (utilization <= latencyUtilizationBands.criticalMaximum) {
    return (
      1.5 +
      1.5 *
        ((utilization - latencyUtilizationBands.warningMaximum) /
          (latencyUtilizationBands.criticalMaximum - latencyUtilizationBands.warningMaximum))
    );
  }
  return 3 + 40 * (utilization - latencyUtilizationBands.criticalMaximum);
}

/**
 * Shared deterministic latency curve. Service and Postgres supply different base
 * latencies; the pressure equation lives only here.
 */
export function latencyForUtilization({
  baseLatencyMs,
  utilization,
}: LatencyForUtilizationInput): number {
  return baseLatencyMs * pressureMultiplier(utilization);
}

function stableById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Applies capacity pressure to component base latencies and reports Phase 1 path p95.
 * No geographic network latency is included.
 */
export function evaluatePathLatency(input: TrafficPropagationInput): PathLatencyResult {
  const services = evaluateServiceCapacity(input);
  if (!services.valid) return services;

  const postgres = evaluatePostgresCapacity(input);
  if (!postgres.valid) return postgres;

  const architecture = input.architecture as Architecture;
  const components: Record<string, ComponentLatencyMetrics> = {};
  const events: SimulationEvent[] = [
    ...services.events,
    ...postgres.events.filter(
      (event) =>
        event.type === "component_load_changed" ||
        event.type === "component_warning" ||
        event.type === "component_saturated",
    ),
  ];

  for (const [componentId, metrics] of Object.entries(services.services)) {
    const p95LatencyMs = latencyForUtilization({
      baseLatencyMs: serviceBaseP95LatencyMs,
      utilization: metrics.utilization,
    });
    components[componentId] = {
      utilization: metrics.utilization,
      baseLatencyMs: serviceBaseP95LatencyMs,
      p95LatencyMs,
    };
    events.push({
      type: "component_load_changed",
      componentId,
      data: { p95LatencyMs, utilization: metrics.utilization },
    });
  }

  for (const [componentId, metrics] of Object.entries(postgres.postgres)) {
    const p95LatencyMs = latencyForUtilization({
      baseLatencyMs: postgresBaseP95LatencyMs,
      utilization: metrics.effectiveUtilization,
    });
    components[componentId] = {
      utilization: metrics.effectiveUtilization,
      baseLatencyMs: postgresBaseP95LatencyMs,
      p95LatencyMs,
    };
    events.push({
      type: "component_load_changed",
      componentId,
      data: { p95LatencyMs, effectiveUtilization: metrics.effectiveUtilization },
    });
  }

  const paths: PathLatencyBreakdown[] = [];
  for (const service of stableById(architecture.components.filter((component) => component.type === "service"))) {
    const serviceLatencyMs = components[service.id]?.p95LatencyMs;
    if (serviceLatencyMs === undefined) continue;

    const databaseEdges = stableById(
      architecture.connections.filter(
        (connection) => connection.sourceComponentId === service.id && connection.type === "read_write",
      ),
    );

    for (const edge of databaseEdges) {
      const postgresLatencyMs = components[edge.targetComponentId]?.p95LatencyMs;
      if (postgresLatencyMs === undefined) continue;
      paths.push({
        serviceId: service.id,
        postgresId: edge.targetComponentId,
        serviceLatencyMs,
        postgresLatencyMs,
        pathLatencyMs: serviceLatencyMs + postgresLatencyMs,
      });
    }
  }

  const worstServiceLatencyMs = Object.keys(services.services).reduce((worst, componentId) => {
    return Math.max(worst, components[componentId]?.p95LatencyMs ?? 0);
  }, 0);
  const p95LatencyMs =
    paths.length > 0
      ? paths.reduce((worst, path) => Math.max(worst, path.pathLatencyMs), 0)
      : worstServiceLatencyMs;

  return {
    valid: true,
    traffic: services.traffic,
    events,
    services: services.services,
    postgres: postgres.postgres,
    components,
    paths,
    p95LatencyMs,
  };
}
