import {
  cdnHitRateForConfig,
  cdnThroughputCapacityForConfig,
  redisEffectiveModel,
  redisHitRateForConfig,
  serviceCapacityForConfig,
  type CdnConfig,
  type LoadBalancerConfig,
  type RedisConfig,
  type ServiceConfig,
  ComponentRegistry,
} from "@faultline/component-catalog";
import type { Architecture, ChallengeDefinition, Connection, JsonObject } from "@faultline/core";

import { evaluateCacheOffload, type CacheResult } from "./cache.js";
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
      caches: Readonly<Record<string, CacheResult>>;
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

function isEdgeCache(simulation: JsonObject | undefined): boolean {
  return simulation?.role === "edge_cache";
}

function isDataCache(simulation: JsonObject | undefined): boolean {
  return simulation?.role === "data_cache";
}

function serviceCapacityWeight(
  architecture: Architecture,
  registry: ComponentRegistry,
  targetComponentId: string,
): number {
  const target = architecture.components.find((component) => component.id === targetComponentId);
  if (!target || target.type !== "service") return 0;
  const parsed = registry.get("service").configSchema.safeParse(target.config);
  if (!parsed.success) return 0;
  return serviceCapacityForConfig(parsed.data as ServiceConfig);
}

/**
 * Deterministic per-edge request allocation for passthrough forwarders.
 * Load balancers honor equal vs capacity_weighted; other forwarders split equally.
 */
function allocateForwardedRequestRps(
  pendingRps: number,
  edges: readonly Connection[],
  architecture: Architecture,
  registry: ComponentRegistry,
  forwarderId: string,
): readonly { edge: Connection; rps: number }[] {
  if (edges.length === 0 || pendingRps <= 0) return [];

  const forwarder = architecture.components.find((component) => component.id === forwarderId);
  let policy: LoadBalancerConfig["policy"] | undefined;
  if (forwarder?.type === "load-balancer") {
    const parsed = registry.get("load-balancer").configSchema.safeParse(forwarder.config);
    if (parsed.success) policy = (parsed.data as LoadBalancerConfig).policy;
  }

  if (policy === "capacity_weighted") {
    const weights = edges.map((edge) => serviceCapacityWeight(architecture, registry, edge.targetComponentId));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight > 0) {
      return edges.map((edge, index) => ({
        edge,
        rps: (pendingRps * weights[index]) / totalWeight,
      }));
    }
  }

  const equalShare = pendingRps / edges.length;
  return edges.map((edge) => ({ edge, rps: equalShare }));
}

function cacheLoadEvents(componentId: string, cache: CacheResult): SimulationEvent[] {
  const events: SimulationEvent[] = [
    {
      type: "component_load_changed",
      componentId,
      data: {
        hitRps: cache.hitRps,
        missRps: cache.missRps,
        hitRate: cache.hitRate,
        utilization: cache.utilization,
        capacityRps: cache.capacityRps,
        downstreamAvoidedRps: cache.downstreamAvoidedRps,
      },
    },
  ];
  if (cache.saturated) {
    events.push({
      type: "component_saturated",
      componentId,
      data: { utilization: cache.utilization, eligibleRps: cache.eligibleRps, capacityRps: cache.capacityRps },
    });
  } else if (cache.utilization > 0.9) {
    events.push({
      type: "component_warning",
      componentId,
      data: { utilization: cache.utilization, state: "critical" },
    });
  } else if (cache.utilization > 0.7) {
    events.push({
      type: "component_warning",
      componentId,
      data: { utilization: cache.utilization, state: "warning" },
    });
  }
  return events;
}

function evaluateCdnCache(
  incomingRps: number,
  config: CdnConfig,
  readRatio: number,
): CacheResult {
  const redirectRps = incomingRps * readRatio;
  const eligibleRps = redirectRps * config.coverage;
  return evaluateCacheOffload({
    eligibleRps,
    configuredHitRate: cdnHitRateForConfig(config),
    capacityRps: cdnThroughputCapacityForConfig(config),
  });
}

function evaluateRedisCache(readRps: number, config: RedisConfig): CacheResult {
  const model = redisEffectiveModel(config);
  return evaluateCacheOffload({
    eligibleRps: readRps,
    configuredHitRate: redisHitRateForConfig(config),
    capacityRps: model.throughputRps,
  });
}

/**
 * Propagates configured workload through the architecture graph.
 * Deterministic flow model only — not capacity or latency.
 *
 * CDN (edge cache) absorbs eligible redirect hits before origin.
 * Redis (data cache) absorbs eligible read hits before Postgres.
 * Writes never hit either cache. Layers compose sequentially on remaining traffic.
 */
export function propagateTraffic({ architecture: input, challenge, registry }: TrafficPropagationInput): TrafficPropagationResult {
  const validation = validateArchitectureForSimulation({ architecture: input, challenge, registry });
  if (!validation.valid) return validation;

  const architecture = validation.architecture;
  const traffic = Object.fromEntries(
    stableById(architecture.components).map((component) => [component.id, createTraffic()]),
  ) as Record<string, ComponentTraffic>;
  const caches: Record<string, CacheResult> = {};
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
  // Bounded passes support chained passthroughs (router → CDN → LB → services).
  for (let pass = 0; pass < architecture.components.length; pass += 1) {
    let forwardedAny = false;
    for (const forwarder of forwarders) {
      const edges = requestEdgesFrom(architecture, forwarder.id);
      if (edges.length === 0) continue;
      const pendingRps = traffic[forwarder.id].incomingRps - traffic[forwarder.id].outgoingRps;
      if (pendingRps <= 0) continue;

      const simulation = registry.get(forwarder.type).simulation;
      let forwardRps = pendingRps;

      if (isEdgeCache(simulation)) {
        const parsed = registry.get(forwarder.type).configSchema.safeParse(forwarder.config);
        if (!parsed.success) continue;
        const cache = evaluateCdnCache(pendingRps, parsed.data as CdnConfig, challenge.workload.readRatio);
        caches[forwarder.id] = cache;
        events.push(...cacheLoadEvents(forwarder.id, cache));
        // Hits stop at the CDN; writes + redirect misses continue to origin.
        forwardRps = pendingRps - cache.hitRps;
      }

      const allocations = allocateForwardedRequestRps(forwardRps, edges, architecture, registry, forwarder.id);
      traffic[forwarder.id].outgoingRps += pendingRps;
      forwardedAny = true;

      for (const { edge, rps } of allocations) {
        if (rps <= 0) continue;
        traffic[edge.targetComponentId].incomingRps += rps;
        events.push({
          type: "traffic_routed",
          connectionId: edge.id,
          componentId: edge.targetComponentId,
          data: { requestsPerSecond: rps, kind: "request" },
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

  // Data caches (Redis) absorb read hits; writes and read misses continue to origin.
  for (const cacheComponent of stableById(
    architecture.components.filter((component) => isDataCache(registry.get(component.type).simulation)),
  )) {
    const edges = databaseEdgesFrom(architecture, cacheComponent.id);
    if (edges.length === 0) continue;

    const pendingReads = traffic[cacheComponent.id].readRps;
    const pendingWrites = traffic[cacheComponent.id].writeRps;
    // outgoingRps tracks how much has already been forwarded from this cache.
    const alreadyForwarded = traffic[cacheComponent.id].outgoingRps;
    if (alreadyForwarded > 0) continue;

    const parsed = registry.get(cacheComponent.type).configSchema.safeParse(cacheComponent.config);
    if (!parsed.success) continue;

    const cache = evaluateRedisCache(pendingReads, parsed.data as RedisConfig);
    caches[cacheComponent.id] = cache;
    events.push(...cacheLoadEvents(cacheComponent.id, cache));

    const forwardReads = cache.missRps;
    const forwardWrites = pendingWrites;
    const forwardTotal = forwardReads + forwardWrites;
    traffic[cacheComponent.id].outgoingRps += forwardTotal;

    const readPerEdge = forwardReads / edges.length;
    const writePerEdge = forwardWrites / edges.length;

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
  return { valid: true, traffic, caches, events };
}
