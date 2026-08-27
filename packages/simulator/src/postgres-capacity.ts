import {
  distributePostgresReads,
  postgresPrimaryReadCapacity,
  postgresReadCapacityForConfig,
  postgresReplicaReadCapacityEach,
  postgresWriteCapacityForConfig,
  type PostgresConfig,
} from "@faultline/component-catalog";
import type { Architecture } from "@faultline/core";

import {
  propagateTraffic,
  type SimulationEvent,
  type TrafficPropagationInput,
  type TrafficPropagationResult,
} from "./traffic.js";

export type PostgresCapacityState = "healthy" | "warning" | "critical" | "saturated";

export interface PostgresCapacityMetrics {
  /** Total read demand reaching this Postgres deployment. */
  readRps: number;
  /** Write demand — always primary-only. */
  writeRps: number;
  /** Capacity-proportional share of reads served by the primary. */
  primaryReadRps: number;
  /** Remaining reads served by logical read replicas (never writes). */
  replicaReadRps: number;
  primaryReadCapacityRps: number;
  replicaReadCapacityRps: number;
  readCapacityRps: number;
  writeCapacityRps: number;
  readReplicaCount: number;
  readUtilization: number;
  writeUtilization: number;
  /** Effective database pressure is the larger of read and write utilization. */
  effectiveUtilization: number;
  readHandledRps: number;
  writeHandledRps: number;
  readCapacityShortfallRps: number;
  writeCapacityShortfallRps: number;
  state: PostgresCapacityState;
}

export type PostgresCapacityResult =
  | (Extract<TrafficPropagationResult, { valid: true }> & {
      postgres: Readonly<Record<string, PostgresCapacityMetrics>>;
    })
  | Extract<TrafficPropagationResult, { valid: false }>;

function stateForUtilization(utilization: number): PostgresCapacityState {
  if (utilization <= 0.7) return "healthy";
  if (utilization <= 0.9) return "warning";
  if (utilization <= 1) return "critical";
  return "saturated";
}

function capacityEvents(componentId: string, metrics: PostgresCapacityMetrics): SimulationEvent[] {
  const events: SimulationEvent[] = [
    {
      type: "component_load_changed",
      componentId,
      data: {
        readRps: metrics.readRps,
        writeRps: metrics.writeRps,
        primaryReadRps: metrics.primaryReadRps,
        replicaReadRps: metrics.replicaReadRps,
        readUtilization: metrics.readUtilization,
        writeUtilization: metrics.writeUtilization,
        effectiveUtilization: metrics.effectiveUtilization,
        readReplicaCount: metrics.readReplicaCount,
      },
    },
  ];
  if (metrics.state === "warning" || metrics.state === "critical") {
    events.push({
      type: "component_warning",
      componentId,
      data: { state: metrics.state, effectiveUtilization: metrics.effectiveUtilization },
    });
  }
  if (metrics.state === "saturated") {
    events.push({
      type: "component_saturated",
      componentId,
      data: {
        readCapacityShortfallRps: metrics.readCapacityShortfallRps,
        writeCapacityShortfallRps: metrics.writeCapacityShortfallRps,
      },
    });
  }
  return events;
}

/**
 * Applies independent Postgres read/write capacity limits to propagated traffic.
 * Reads are split capacity-proportionally across primary + logical replicas.
 * Writes remain entirely on the primary.
 */
export function evaluatePostgresCapacity(input: TrafficPropagationInput): PostgresCapacityResult {
  const propagation = propagateTraffic(input);
  if (!propagation.valid) return propagation;

  const architecture = input.architecture as Architecture;
  const postgres: Record<string, PostgresCapacityMetrics> = {};
  const events = [...propagation.events];

  for (const component of architecture.components
    .filter((candidate) => candidate.type === "postgres")
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const parsed = input.registry.get(component.type).configSchema.safeParse(component.config);
    if (!parsed.success) continue;
    const config = parsed.data as PostgresConfig;
    const primaryReadCapacityRps = postgresPrimaryReadCapacity(config);
    const replicaReadCapacityEach = postgresReplicaReadCapacityEach(config);
    const replicaReadCapacityRps = config.readReplicaCount * replicaReadCapacityEach;
    const readCapacityRps = postgresReadCapacityForConfig(config);
    const writeCapacityRps = postgresWriteCapacityForConfig(config);
    const traffic = propagation.traffic[component.id];
    const { primaryReadRps, replicaReadRps } = distributePostgresReads(traffic.readRps, config);
    const readUtilization = traffic.readRps / readCapacityRps;
    const writeUtilization = traffic.writeRps / writeCapacityRps;
    const effectiveUtilization = Math.max(readUtilization, writeUtilization);
    const metrics: PostgresCapacityMetrics = {
      readRps: traffic.readRps,
      writeRps: traffic.writeRps,
      primaryReadRps,
      replicaReadRps,
      primaryReadCapacityRps,
      replicaReadCapacityRps,
      readCapacityRps,
      writeCapacityRps,
      readReplicaCount: config.readReplicaCount,
      readUtilization,
      writeUtilization,
      effectiveUtilization,
      readHandledRps: Math.min(traffic.readRps, readCapacityRps),
      writeHandledRps: Math.min(traffic.writeRps, writeCapacityRps),
      readCapacityShortfallRps: Math.max(0, traffic.readRps - readCapacityRps),
      writeCapacityShortfallRps: Math.max(0, traffic.writeRps - writeCapacityRps),
      state: stateForUtilization(effectiveUtilization),
    };
    postgres[component.id] = metrics;
    events.push(...capacityEvents(component.id, metrics));
  }

  return {
    valid: true,
    traffic: propagation.traffic,
    caches: propagation.caches,
    regionalWorkload: propagation.regionalWorkload,
    regionalTraffic: propagation.regionalTraffic,
    geographicRoutes: propagation.geographicRoutes,
    events,
    unroutableRps: propagation.unroutableRps,
    postgres,
  };
}
