import {
  postgresBaseP95LatencyMs,
  serviceBaseP95LatencyMs,
} from "@faultline/component-catalog";
import type { Architecture, RegionId } from "@faultline/core";

import type { CacheResult } from "./cache.js";
import type { GeographicRoute } from "./geographic-routing.js";
import { evaluatePostgresCapacity, type PostgresCapacityMetrics } from "./postgres-capacity.js";
import { evaluateServiceCapacity, type ServiceCapacityMetrics } from "./service-capacity.js";
import type { RegionalWorkload } from "./regional-workload.js";
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

/** Per-origin redirect path used for geographic p95 approximation. */
export interface GeographicOriginLatency {
  originRegion: RegionId;
  serviceRegion: RegionId;
  redirectRps: number;
  networkToServiceMs: number;
  serviceLatencyMs: number;
  networkToDatastoreMs: number;
  postgresLatencyMs: number;
  cacheHitRate: number;
  /** Full redirect path: network hops (RTT each) + component processing. */
  pathLatencyMs: number;
}

export type PathLatencyResult =
  | (Extract<TrafficPropagationResult, { valid: true }> & {
      services: Readonly<Record<string, ServiceCapacityMetrics>>;
      postgres: Readonly<Record<string, PostgresCapacityMetrics>>;
      components: Readonly<Record<string, ComponentLatencyMetrics>>;
      paths: readonly PathLatencyBreakdown[];
      /** Present when geographic routing produced origin paths. */
      geographicOriginLatencies?: readonly GeographicOriginLatency[];
      /**
       * Challenge redirect p95 approximation.
       * Logical mode: worst Traffic→Service→Postgres component path.
       * Geographic mode: discrete traffic-weighted regional p95 over origin paths
       * (network RTT hops + component pressure latency).
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
 * Discrete regional p95: sort origin paths by latency, walk cumulative redirect
 * weight until 95% of redirect traffic is covered.
 */
export function discreteTrafficWeightedP95(
  samples: readonly { weight: number; latencyMs: number }[],
): number {
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
  if (totalWeight <= 0 || samples.length === 0) return 0;

  const ordered = [...samples].sort((left, right) => left.latencyMs - right.latencyMs);
  const target = totalWeight * 0.95;
  let cumulative = 0;
  for (const sample of ordered) {
    cumulative += sample.weight;
    if (cumulative >= target) return sample.latencyMs;
  }
  return ordered[ordered.length - 1]?.latencyMs ?? 0;
}

function weightedAverageNetworkMs(routes: readonly GeographicRoute[]): number {
  const totalRps = routes.reduce((sum, route) => sum + route.rps, 0);
  if (totalRps <= 0) return 0;
  return routes.reduce((sum, route) => sum + route.networkLatencyMs * route.rps, 0) / totalRps;
}

function redisHitRate(
  architecture: Architecture,
  caches: Readonly<Record<string, CacheResult>>,
  serviceId: string,
): { hitRate: number; redisId: string | null } {
  const redisEdge = architecture.connections.find(
    (connection) =>
      connection.sourceComponentId === serviceId &&
      connection.type === "read_write" &&
      architecture.components.some(
        (component) => component.id === connection.targetComponentId && component.type === "redis",
      ),
  );
  if (!redisEdge) return { hitRate: 0, redisId: null };
  const cache = caches[redisEdge.targetComponentId];
  return { hitRate: cache?.hitRate ?? 0, redisId: redisEdge.targetComponentId };
}

/**
 * Builds per-origin redirect path latency from geographicRoutes + component pressure.
 * Matrix RTTs are added once per remote hop; cache hits skip downstream DB network+processing.
 */
export function buildGeographicOriginLatencies(input: {
  architecture: Architecture;
  regionalWorkload: RegionalWorkload;
  geographicRoutes: readonly GeographicRoute[];
  caches: Readonly<Record<string, CacheResult>>;
  components: Readonly<Record<string, ComponentLatencyMetrics>>;
}): GeographicOriginLatency[] {
  const { architecture, regionalWorkload, geographicRoutes, caches, components } = input;
  if (!regionalWorkload.active || geographicRoutes.length === 0) return [];

  const results: GeographicOriginLatency[] = [];

  for (const origin of regionalWorkload.origins) {
    if (origin.redirectRps <= 0) continue;

    const requestRoutes = geographicRoutes.filter(
      (route) => route.kind === "request" && route.originRegion === origin.regionId,
    );
    if (requestRoutes.length === 0) continue;

    // Dominant service for this origin (highest rps).
    const primaryRequest = [...requestRoutes].sort((left, right) => right.rps - left.rps)[0]!;
    const serviceId = primaryRequest.componentId;
    const serviceRegion = primaryRequest.destinationRegion;
    const totalOriginRps = origin.redirectRps + origin.writeRps;
    // Request routes contain the post-CDN miss/write volume. CDN hits never
    // reach Service, Redis, or Postgres, so their processing and network work
    // must be weighted out of the origin path.
    const originServiceFraction =
      totalOriginRps > 0
        ? Math.min(1, requestRoutes.reduce((sum, route) => sum + route.rps, 0) / totalOriginRps)
        : 0;
    const networkToServiceMs = weightedAverageNetworkMs(requestRoutes) * originServiceFraction;
    const serviceLatencyMs = (components[serviceId]?.p95LatencyMs ?? 0) * originServiceFraction;

    const { hitRate, redisId } = redisHitRate(architecture, caches, serviceId);

    const redisRoutes = redisId
      ? geographicRoutes.filter(
          (route) =>
            route.kind === "read" &&
            route.componentId === redisId &&
            route.originRegion === serviceRegion,
        )
      : [];
    // After Redis, miss traffic is attributed with origin = Redis destination region.
    const datastoreOriginRegion =
      redisRoutes.length > 0 ? (redisRoutes[0]?.destinationRegion ?? serviceRegion) : serviceRegion;

    const postgresReadRoutes = geographicRoutes.filter((route) => {
      if (route.kind !== "read" || route.originRegion !== datastoreOriginRegion) return false;
      const component = architecture.components.find((entry) => entry.id === route.componentId);
      return component?.type === "postgres";
    });

    const postgresId =
      postgresReadRoutes[0]?.componentId ??
      architecture.components.find((component) => component.type === "postgres")?.id;
    const postgresLatencyMs = postgresId ? (components[postgresId]?.p95LatencyMs ?? 0) : 0;

    let networkToDatastoreMs = 0;
    let effectivePostgresLatencyMs = 0;

    if (redisRoutes.length > 0) {
      const redisNetworkMs = weightedAverageNetworkMs(redisRoutes);
      const missNetworkMs =
        postgresReadRoutes.length > 0 ? weightedAverageNetworkMs(postgresReadRoutes) : 0;
      // Hit: pay Redis RTT only. Miss: Redis RTT + Postgres RTT + Postgres processing.
      networkToDatastoreMs = originServiceFraction * (redisNetworkMs + (1 - hitRate) * missNetworkMs);
      effectivePostgresLatencyMs = originServiceFraction * (1 - hitRate) * postgresLatencyMs;
    } else if (postgresReadRoutes.length > 0) {
      networkToDatastoreMs = originServiceFraction * weightedAverageNetworkMs(postgresReadRoutes);
      effectivePostgresLatencyMs = originServiceFraction * postgresLatencyMs;
    }

    const pathLatencyMs =
      networkToServiceMs + serviceLatencyMs + networkToDatastoreMs + effectivePostgresLatencyMs;

    results.push({
      originRegion: origin.regionId,
      serviceRegion,
      redirectRps: origin.redirectRps,
      networkToServiceMs,
      serviceLatencyMs,
      networkToDatastoreMs,
      postgresLatencyMs: effectivePostgresLatencyMs,
      cacheHitRate: hitRate,
      pathLatencyMs,
    });
  }

  return results;
}

/**
 * Applies capacity pressure to component base latencies and reports request p95.
 * Geographic mode adds matrix RTT hops from simulation routes without replacing component latency.
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
    const penalty = metrics.placement?.participation === "active" ? metrics.placement.processingLatencyPenaltyMs : 0;
    const p95LatencyMs =
      latencyForUtilization({
        baseLatencyMs: serviceBaseP95LatencyMs,
        utilization: metrics.utilization,
      }) + penalty;
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
    const penalty = metrics.placement?.participation === "active" ? metrics.placement.processingLatencyPenaltyMs : 0;
    const p95LatencyMs =
      latencyForUtilization({
        baseLatencyMs: postgresBaseP95LatencyMs,
        utilization: metrics.effectiveUtilization,
      }) + penalty;
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
      const target = architecture.components.find((component) => component.id === edge.targetComponentId);
      // Logical path summary still Service→Postgres (through Redis edges, skip non-postgres).
      if (target?.type === "redis") {
        const originEdges = stableById(
          architecture.connections.filter(
            (connection) =>
              connection.sourceComponentId === target.id && connection.type === "read_write",
          ),
        );
        for (const originEdge of originEdges) {
          const postgresLatencyMs = components[originEdge.targetComponentId]?.p95LatencyMs;
          if (postgresLatencyMs === undefined) continue;
          paths.push({
            serviceId: service.id,
            postgresId: originEdge.targetComponentId,
            serviceLatencyMs,
            postgresLatencyMs,
            pathLatencyMs: serviceLatencyMs + postgresLatencyMs,
          });
        }
        continue;
      }

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

  const geographicOriginLatencies = buildGeographicOriginLatencies({
    architecture,
    regionalWorkload: services.regionalWorkload,
    geographicRoutes: services.geographicRoutes,
    caches: services.caches,
    components,
  });

  const worstServiceLatencyMs = Object.keys(services.services).reduce((worst, componentId) => {
    return Math.max(worst, components[componentId]?.p95LatencyMs ?? 0);
  }, 0);

  let p95LatencyMs: number;
  if (geographicOriginLatencies.length > 0) {
    p95LatencyMs = discreteTrafficWeightedP95(
      geographicOriginLatencies.map((origin) => ({
        weight: origin.redirectRps,
        latencyMs: origin.pathLatencyMs,
      })),
    );
  } else {
    p95LatencyMs =
      paths.length > 0
        ? paths.reduce((worst, path) => Math.max(worst, path.pathLatencyMs), 0)
        : worstServiceLatencyMs;
  }

  return {
    valid: true,
    traffic: services.traffic,
    caches: services.caches,
    regionalWorkload: services.regionalWorkload,
    regionalTraffic: services.regionalTraffic,
    geographicRoutes: services.geographicRoutes,
    events,
    unroutableRps: services.unroutableRps,
    services: services.services,
    postgres: postgres.postgres,
    components,
    paths,
    geographicOriginLatencies:
      geographicOriginLatencies.length > 0 ? geographicOriginLatencies : undefined,
    p95LatencyMs,
  };
}
