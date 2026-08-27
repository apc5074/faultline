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
import type {
  Architecture,
  ChallengeDefinition,
  Connection,
  ExperimentOverlay,
  JsonObject,
  RegionId,
} from "@faultline/core";
import { isValidRegion } from "@faultline/core";

import { evaluateCacheOffload, type CachePlacementEvidence, type CacheResult } from "./cache.js";
import {
  addRegionalTraffic,
  architectureHasServiceDeployments,
  findReachableServices,
  selectNearestHealthyDeployment,
  selectPostgresDeploymentForTraffic,
  selectRedisDeploymentForServiceRegion,
  serviceDeploymentCandidates,
  type GeographicRoute,
  type RegionalComponentTraffic,
} from "./geographic-routing.js";
import { getRegionLatencyMs } from "./region-latency.js";
import { deriveRegionalWorkload, type RegionalWorkload } from "./regional-workload.js";
import {
  validateArchitectureForSimulation,
  type SimulationValidationError,
} from "./validation.js";
import {
  loadBalancerFanOutPlayerIntent,
  resolveCacheConfiguredHitRate,
  resolveMechanismPlacement,
  type RoleResolutionContext,
} from "./workload-affinity.js";

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
  /** Temporary experiment state; never persisted to canonical architecture. */
  overlay?: ExperimentOverlay;
}

export type TrafficPropagationResult =
  | {
      valid: true;
      traffic: Readonly<Record<string, ComponentTraffic>>;
      caches: Readonly<Record<string, CacheResult & CachePlacementEvidence>>;
      /** Challenge-derived traffic origins; empty/inactive when geography is unset. */
      regionalWorkload: RegionalWorkload;
      /** Per-component per-region load when geographic routing is active. */
      regionalTraffic: Readonly<Record<string, Readonly<Record<string, RegionalComponentTraffic>>>>;
      /** Deterministic geographic route records for visualization. */
      geographicRoutes: readonly GeographicRoute[];
      events: readonly SimulationEvent[];
      /** Request demand with no healthy reachable Service during an experiment. */
      unroutableRps: number;
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
  challenge: ChallengeDefinition,
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
      const equalShare = pendingRps / edges.length;
      const weighted = edges.map((edge, index) => ({
        edge,
        weightedRps: (pendingRps * weights[index]) / totalWeight,
      }));
      if (forwarder?.type === "load-balancer") {
        const placement = resolveMechanismPlacement({
          challenge,
          catalogType: "load-balancer",
          nodeId: forwarderId,
          architecture,
          playerIntent: loadBalancerFanOutPlayerIntent(architecture, forwarderId),
          handledRps: pendingRps,
        });
        const blend = placement?.participation === "active" ? placement.effective : 1;
        return weighted.map(({ edge, weightedRps }) => ({
          edge,
          rps: equalShare * (1 - blend) + weightedRps * blend,
        }));
      }
      return weighted.map(({ edge, weightedRps }) => ({ edge, rps: weightedRps }));
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
  componentId: string,
  incomingRps: number,
  config: CdnConfig,
  architecture: Architecture,
  challenge: ChallengeDefinition,
  overlay?: ExperimentOverlay,
  affinityContext?: RoleResolutionContext,
): CacheResult & CachePlacementEvidence {
  const redirectRps = incomingRps * challenge.workload.readRatio;
  const eligibleRps = redirectRps * config.coverage;
  const { finalConfiguredHitRate, ...evidence } = resolveCacheConfiguredHitRate({
    componentId,
    catalogType: "cdn",
    playerIntent: cdnHitRateForConfig(config),
    architecture,
    challenge,
    context: affinityContext,
    coldCache: overlay?.coldCacheComponentIds?.includes(componentId),
  });
  const offload = evaluateCacheOffload({
    eligibleRps,
    configuredHitRate: finalConfiguredHitRate,
    capacityRps: cdnThroughputCapacityForConfig(config),
  });
  return { ...offload, ...evidence };
}

function evaluateRedisCache(
  componentId: string,
  readRps: number,
  config: RedisConfig,
  architecture: Architecture,
  challenge: ChallengeDefinition,
  overlay?: ExperimentOverlay,
  affinityContext?: RoleResolutionContext,
): CacheResult & CachePlacementEvidence {
  const model = redisEffectiveModel(config);
  const { finalConfiguredHitRate, ...evidence } = resolveCacheConfiguredHitRate({
    componentId,
    catalogType: "redis",
    playerIntent: redisHitRateForConfig(config),
    architecture,
    challenge,
    context: affinityContext,
    coldCache: overlay?.coldCacheComponentIds?.includes(componentId),
  });
  const offload = evaluateCacheOffload({
    eligibleRps: readRps,
    configuredHitRate: finalConfiguredHitRate,
    capacityRps: model.throughputRps,
  });
  return { ...offload, ...evidence };
}

/**
 * Propagates configured workload through the architecture graph.
 * Deterministic flow model only — not capacity or latency scoring.
 *
 * When challenge geography is active and services have regional deployments,
 * Global Router / request path uses nearest-healthy deployment selection.
 * Otherwise Phase 1/2 logical equal/weighted forwarding applies.
 *
 * CDN (edge cache) absorbs eligible redirect hits before origin.
 * Redis (data cache) absorbs eligible read hits before Postgres.
 * Writes never hit either cache. Layers compose sequentially on remaining traffic.
 */
export function propagateTraffic({ architecture: input, challenge, registry, overlay }: TrafficPropagationInput): TrafficPropagationResult {
  const validation = validateArchitectureForSimulation({ architecture: input, challenge, registry });
  if (!validation.valid) return validation;

  const architecture = validation.architecture;
  const regionalWorkload = deriveRegionalWorkload(challenge);
  const useGeographicRouting = regionalWorkload.active && architectureHasServiceDeployments(architecture);

  if (useGeographicRouting) {
    return propagateGeographicTraffic(architecture, challenge, registry, regionalWorkload, overlay);
  }

  return propagateLogicalTraffic(architecture, challenge, registry, regionalWorkload, overlay);
}

function emptyRegionalTraffic(): Record<string, Record<string, RegionalComponentTraffic>> {
  return {};
}

function propagateLogicalTraffic(
  architecture: Architecture,
  challenge: ChallengeDefinition,
  registry: ComponentRegistry,
  regionalWorkload: RegionalWorkload,
  overlay?: ExperimentOverlay,
): Extract<TrafficPropagationResult, { valid: true }> {
  const traffic = Object.fromEntries(
    stableById(architecture.components).map((component) => [component.id, createTraffic()]),
  ) as Record<string, ComponentTraffic>;
  const caches: Record<string, CacheResult & CachePlacementEvidence> = {};
  let unroutableRps = 0;
  const events: SimulationEvent[] = [{ type: "simulation_started", data: { requestsPerSecond: challenge.workload.requestsPerSecond } }];
  const sources = stableById(architecture.components.filter((component) => component.type === "traffic-source"));
  const workloadPerSource = challenge.workload.requestsPerSecond / sources.length;

  for (const source of sources) {
    const edges = requestEdgesFrom(architecture, source.id);
    traffic[source.id].outgoingRps += workloadPerSource;
    const eligibleEdges = edges.filter((edge) => !overlay?.failedComponentIds?.includes(edge.targetComponentId));
    if (eligibleEdges.length === 0) {
      unroutableRps += workloadPerSource;
      events.push({ type: "traffic_routed", componentId: source.id, data: { requestsPerSecond: workloadPerSource, kind: "unroutable" } });
      continue;
    }
    const trafficPerEdge = workloadPerSource / eligibleEdges.length;

    for (const edge of eligibleEdges) {
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
        const cache = evaluateCdnCache(forwarder.id, pendingRps, parsed.data as CdnConfig, architecture, challenge, overlay);
        caches[forwarder.id] = cache;
        events.push(...cacheLoadEvents(forwarder.id, cache));
        forwardRps = pendingRps - cache.hitRps;
      }

      const eligibleEdges = edges.filter((edge) => !overlay?.failedComponentIds?.includes(edge.targetComponentId));
      if (eligibleEdges.length === 0 && forwardRps > 0) {
        unroutableRps += forwardRps;
        traffic[forwarder.id].outgoingRps += pendingRps;
        events.push({ type: "traffic_routed", componentId: forwarder.id, data: { requestsPerSecond: forwardRps, kind: "unroutable" } });
        forwardedAny = true;
        continue;
      }
      const allocations = allocateForwardedRequestRps(forwardRps, eligibleEdges, architecture, registry, forwarder.id, challenge);
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

  for (const cacheComponent of stableById(
    architecture.components.filter((component) => isDataCache(registry.get(component.type).simulation)),
  )) {
    const edges = databaseEdgesFrom(architecture, cacheComponent.id);
    if (edges.length === 0) continue;

    const pendingReads = traffic[cacheComponent.id].readRps;
    const pendingWrites = traffic[cacheComponent.id].writeRps;
    const alreadyForwarded = traffic[cacheComponent.id].outgoingRps;
    if (alreadyForwarded > 0) continue;

    const parsed = registry.get(cacheComponent.type).configSchema.safeParse(cacheComponent.config);
    if (!parsed.success) continue;

    const cache = evaluateRedisCache(cacheComponent.id, pendingReads, parsed.data as RedisConfig, architecture, challenge, overlay);
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
  return {
    valid: true,
    traffic,
    caches,
    regionalWorkload,
    regionalTraffic: emptyRegionalTraffic(),
    geographicRoutes: [],
    events,
    unroutableRps,
  };
}

function propagateGeographicTraffic(
  architecture: Architecture,
  challenge: ChallengeDefinition,
  registry: ComponentRegistry,
  regionalWorkload: RegionalWorkload,
  overlay?: ExperimentOverlay,
): Extract<TrafficPropagationResult, { valid: true }> {
  const traffic = Object.fromEntries(
    stableById(architecture.components).map((component) => [component.id, createTraffic()]),
  ) as Record<string, ComponentTraffic>;
  const regionalTraffic: Record<string, Record<string, RegionalComponentTraffic>> = {};
  const geographicRoutes: GeographicRoute[] = [];
  const caches: Record<string, CacheResult & CachePlacementEvidence> = {};
  let unroutableRps = 0;
  const events: SimulationEvent[] = [
    {
      type: "simulation_started",
      data: { requestsPerSecond: challenge.workload.requestsPerSecond, geographicRouting: 1 },
    },
  ];

  const sources = stableById(architecture.components.filter((component) => component.type === "traffic-source"));
  const isForwarder = (component: { type: string }) =>
    forwardsRequests(registry.get(component.type).simulation);

  for (const origin of regionalWorkload.origins) {
    const originRps = origin.redirectRps + origin.writeRps;
    if (originRps <= 0 || sources.length === 0) continue;

    const rpsPerSource = originRps / sources.length;
    for (const source of sources) {
      traffic[source.id].outgoingRps += rpsPerSource;

      const reachableServices = findReachableServices(architecture, [source.id], (component) =>
        isForwarder(component),
      );
      const candidates = serviceDeploymentCandidates(
        reachableServices.filter((service) => !overlay?.failedComponentIds?.includes(service.id)),
      );
      const selected = selectNearestHealthyDeployment(origin.regionId, candidates, overlay?.failedRegionIds);
      if (!selected) {
        unroutableRps += rpsPerSource;
        events.push({ type: "traffic_routed", componentId: source.id, data: { requestsPerSecond: rpsPerSource, kind: "unroutable", originRegion: origin.regionId } });
        continue;
      }

      const networkLatencyMs = getRegionLatencyMs(origin.regionId, selected.regionId);

      // Attribute passthrough volume on Global Router / CDN / LB along a deterministic path.
      attributePassthroughPath({
        architecture,
        registry,
        sourceId: source.id,
        serviceId: selected.componentId,
        rps: rpsPerSource,
        traffic,
        events,
        originRegion: origin.regionId,
      });

      traffic[selected.componentId].incomingRps += rpsPerSource;
      addRegionalTraffic(regionalTraffic, selected.componentId, selected.regionId, {
        incomingRps: rpsPerSource,
      });
      geographicRoutes.push({
        originRegion: origin.regionId,
        destinationRegion: selected.regionId,
        componentId: selected.componentId,
        deploymentId: selected.deployment.id,
        rps: rpsPerSource,
        networkLatencyMs,
        kind: "request",
      });
      events.push({
        type: "traffic_routed",
        componentId: selected.componentId,
        data: {
          requestsPerSecond: rpsPerSource,
          kind: "request",
          originRegion: origin.regionId,
          destinationRegion: selected.regionId,
          deploymentId: selected.deployment.id,
          networkLatencyMs,
        },
      });

      const service = architecture.components.find((component) => component.id === selected.componentId);
      if (!service) continue;

      const readRps = rpsPerSource * challenge.workload.readRatio;
      const writeRps = rpsPerSource * challenge.workload.writeRatio;
      traffic[service.id].outgoingRps += rpsPerSource;

      const dbEdges = databaseEdgesFrom(architecture, service.id);
      if (dbEdges.length === 0) continue;
      const readPerEdge = readRps / dbEdges.length;
      const writePerEdge = writeRps / dbEdges.length;

      for (const edge of dbEdges) {
        const target = architecture.components.find((component) => component.id === edge.targetComponentId);
        if (!target) continue;

        if (target.type === "redis") {
          const redisDeployment = selectRedisDeploymentForServiceRegion(target, selected.regionId, overlay?.failedRegionIds);
          const redisRegion: RegionId = isValidRegion(redisDeployment?.regionId)
            ? redisDeployment.regionId
            : selected.regionId;
          traffic[target.id].incomingRps += readPerEdge + writePerEdge;
          traffic[target.id].readRps += readPerEdge;
          traffic[target.id].writeRps += writePerEdge;
          if (redisDeployment) {
            addRegionalTraffic(regionalTraffic, target.id, redisRegion, {
              incomingRps: readPerEdge + writePerEdge,
              readRps: readPerEdge,
              writeRps: writePerEdge,
            });
          }
          geographicRoutes.push({
            originRegion: selected.regionId,
            destinationRegion: redisRegion,
            componentId: target.id,
            deploymentId: redisDeployment?.id ?? target.id,
            rps: readPerEdge + writePerEdge,
            networkLatencyMs: redisDeployment
              ? getRegionLatencyMs(selected.regionId, redisDeployment.regionId)
              : 0,
            kind: "read",
          });
          events.push({
            type: "traffic_routed",
            connectionId: edge.id,
            componentId: target.id,
            data: {
              readRequestsPerSecond: readPerEdge,
              writeRequestsPerSecond: writePerEdge,
              kind: "read_write",
              serviceRegion: selected.regionId,
              destinationRegion: redisRegion,
            },
          });
          continue;
        }

        if (target.type === "postgres") {
          routeToPostgres({
            postgres: target,
            serviceRegionId: selected.regionId,
            readRps: readPerEdge,
            writeRps: writePerEdge,
            edgeId: edge.id,
            traffic,
            regionalTraffic,
            geographicRoutes,
            events,
            excludedRegionIds: overlay?.failedRegionIds,
            unroutable: {
              add: (rps) => {
                unroutableRps += rps;
              },
            },
          });
        }
      }
    }
  }

  for (const forwarder of stableById(
    architecture.components.filter((component) => isEdgeCache(registry.get(component.type).simulation)),
  )) {
    const pendingRps = traffic[forwarder.id].incomingRps - traffic[forwarder.id].outgoingRps;
    if (pendingRps <= 0) continue;
    const parsed = registry.get(forwarder.type).configSchema.safeParse(forwarder.config);
    if (!parsed.success) continue;
    const cache = evaluateCdnCache(forwarder.id, pendingRps, parsed.data as CdnConfig, architecture, challenge, overlay, {
      geographicRoutingActive: true,
    });
    caches[forwarder.id] = cache;
    events.push(...cacheLoadEvents(forwarder.id, cache));
    traffic[forwarder.id].outgoingRps += pendingRps;
  }

  for (const router of stableById(architecture.components.filter((component) => component.type === "global-router"))) {
    if (traffic[router.id].incomingRps > traffic[router.id].outgoingRps) {
      traffic[router.id].outgoingRps = traffic[router.id].incomingRps;
    }
  }

  for (const cacheComponent of stableById(
    architecture.components.filter((component) => isDataCache(registry.get(component.type).simulation)),
  )) {
    const edges = databaseEdgesFrom(architecture, cacheComponent.id);
    if (edges.length === 0) continue;
    if (traffic[cacheComponent.id].outgoingRps > 0) continue;

    const pendingReads = traffic[cacheComponent.id].readRps;
    const pendingWrites = traffic[cacheComponent.id].writeRps;
    if (pendingReads <= 0 && pendingWrites <= 0) continue;

    const parsed = registry.get(cacheComponent.type).configSchema.safeParse(cacheComponent.config);
    if (!parsed.success) continue;
    const cache = evaluateRedisCache(cacheComponent.id, pendingReads, parsed.data as RedisConfig, architecture, challenge, overlay, {
      geographicRoutingActive: true,
    });
    caches[cacheComponent.id] = cache;
    events.push(...cacheLoadEvents(cacheComponent.id, cache));

    const hitRate = pendingReads > 0 ? cache.hitRps / pendingReads : 0;
    const postgresEdges = edges.filter((edge) => {
      const target = architecture.components.find((component) => component.id === edge.targetComponentId);
      return target?.type === "postgres";
    });
    const targets = postgresEdges.length > 0 ? postgresEdges : edges;

    const byRegion = regionalTraffic[cacheComponent.id];
    const regionEntries: Array<{ regionId: string; entry: RegionalComponentTraffic }> =
      byRegion && Object.keys(byRegion).length > 0
        ? Object.entries(byRegion).map(([regionId, entry]) => ({ regionId, entry }))
        : [
            {
              regionId: "us-east",
              entry: {
                incomingRps: pendingReads + pendingWrites,
                readRps: pendingReads,
                writeRps: pendingWrites,
              },
            },
          ];

    let forwardedTotal = 0;
    for (const { regionId, entry } of regionEntries) {
      const serviceRegion: RegionId = isValidRegion(regionId) ? regionId : "us-east";
      const regionForwardReads = entry.readRps * (1 - hitRate);
      const regionForwardWrites = entry.writeRps;
      const forwardTotal = regionForwardReads + regionForwardWrites;
      if (forwardTotal <= 0) continue;
      forwardedTotal += forwardTotal;

      const readPerEdge = regionForwardReads / targets.length;
      const writePerEdge = regionForwardWrites / targets.length;

      for (const edge of targets) {
        const target = architecture.components.find((component) => component.id === edge.targetComponentId);
        if (!target || target.type !== "postgres") {
          const targetTraffic = traffic[edge.targetComponentId];
          targetTraffic.incomingRps += readPerEdge + writePerEdge;
          targetTraffic.readRps += readPerEdge;
          targetTraffic.writeRps += writePerEdge;
          continue;
        }

        routeToPostgres({
          postgres: target,
          serviceRegionId: serviceRegion,
          readRps: readPerEdge,
          writeRps: writePerEdge,
          edgeId: edge.id,
          traffic,
          regionalTraffic,
          geographicRoutes,
          events,
          excludedRegionIds: overlay?.failedRegionIds,
          unroutable: {
            add: (rps) => {
              unroutableRps += rps;
            },
          },
        });
      }
    }

    traffic[cacheComponent.id].outgoingRps += forwardedTotal;
  }

  events.push({ type: "simulation_finished", data: { requestsPerSecond: challenge.workload.requestsPerSecond } });
  return {
    valid: true,
    traffic,
    caches,
    regionalWorkload,
    regionalTraffic,
    geographicRoutes,
    events,
    unroutableRps,
  };
}

/** Walk a deterministic request path from traffic source toward the chosen service, attributing passthrough volume. */
function attributePassthroughPath(input: {
  architecture: Architecture;
  registry: ComponentRegistry;
  sourceId: string;
  serviceId: string;
  rps: number;
  traffic: Record<string, ComponentTraffic>;
  events: SimulationEvent[];
  originRegion: string;
}): void {
  const { architecture, registry, sourceId, serviceId, rps, traffic, events, originRegion } = input;
  const byId = new Map(architecture.components.map((component) => [component.id, component]));
  let currentId = sourceId;
  const visited = new Set<string>();

  while (currentId !== serviceId && !visited.has(currentId)) {
    visited.add(currentId);
    const edges = requestEdgesFrom(architecture, currentId);
    if (edges.length === 0) break;

    // Prefer an edge that can still reach the selected service; else first stable edge.
    let chosen = edges[0];
    for (const edge of edges) {
      const reachable = findReachableServices(architecture, [edge.targetComponentId], (component) =>
        forwardsRequests(registry.get(component.type).simulation),
      );
      if (reachable.some((service) => service.id === serviceId) || edge.targetComponentId === serviceId) {
        chosen = edge;
        break;
      }
    }

    const target = byId.get(chosen.targetComponentId);
    if (!target) break;
    if (target.id === serviceId) {
      // Service attribution happens in the caller.
      events.push({
        type: "traffic_routed",
        connectionId: chosen.id,
        componentId: target.id,
        data: { requestsPerSecond: rps, kind: "request", originRegion },
      });
      break;
    }

    if (forwardsRequests(registry.get(target.type).simulation) || target.type === "traffic-source") {
      traffic[target.id].incomingRps += rps;
      events.push({
        type: "traffic_routed",
        connectionId: chosen.id,
        componentId: target.id,
        data: { requestsPerSecond: rps, kind: "request", originRegion },
      });
      currentId = target.id;
      continue;
    }

    break;
  }
}

function routeToPostgres(input: {
  postgres: import("@faultline/core").ComponentInstance;
  serviceRegionId: RegionId;
  readRps: number;
  writeRps: number;
  edgeId: string;
  traffic: Record<string, ComponentTraffic>;
  regionalTraffic: Record<string, Record<string, RegionalComponentTraffic>>;
  geographicRoutes: GeographicRoute[];
  events: SimulationEvent[];
  excludedRegionIds?: readonly string[];
  unroutable: { add: (rps: number) => void };
}): void {
  const {
    postgres,
    serviceRegionId,
    readRps,
    writeRps,
    edgeId,
    traffic,
    regionalTraffic,
    geographicRoutes,
    events,
    excludedRegionIds,
    unroutable,
  } = input;

  const writeDeployment = selectPostgresDeploymentForTraffic(postgres, serviceRegionId, "write", excludedRegionIds);
  const readDeployment = selectPostgresDeploymentForTraffic(postgres, serviceRegionId, "read", excludedRegionIds);

  const routedReadRps = readDeployment ? readRps : 0;
  const routedWriteRps = writeDeployment ? writeRps : 0;
  const unavailableRps = readRps - routedReadRps + writeRps - routedWriteRps;
  traffic[postgres.id].incomingRps += routedReadRps + routedWriteRps;
  traffic[postgres.id].readRps += routedReadRps;
  traffic[postgres.id].writeRps += routedWriteRps;
  if (unavailableRps > 0) {
    unroutable.add(unavailableRps);
    events.push({
      type: "traffic_routed",
      connectionId: edgeId,
      componentId: postgres.id,
      data: { requestsPerSecond: unavailableRps, kind: "unroutable", reason: "database_unavailable" },
    });
  }

  if (writeDeployment && writeRps > 0 && isValidRegion(writeDeployment.regionId)) {
    addRegionalTraffic(regionalTraffic, postgres.id, writeDeployment.regionId, {
      incomingRps: writeRps,
      writeRps,
    });
    geographicRoutes.push({
      originRegion: serviceRegionId,
      destinationRegion: writeDeployment.regionId,
      componentId: postgres.id,
      deploymentId: writeDeployment.id,
      rps: writeRps,
      networkLatencyMs: getRegionLatencyMs(serviceRegionId, writeDeployment.regionId),
      kind: "write",
    });
  }

  if (readDeployment && readRps > 0 && isValidRegion(readDeployment.regionId)) {
    addRegionalTraffic(regionalTraffic, postgres.id, readDeployment.regionId, {
      incomingRps: readRps,
      readRps,
    });
    geographicRoutes.push({
      originRegion: serviceRegionId,
      destinationRegion: readDeployment.regionId,
      componentId: postgres.id,
      deploymentId: readDeployment.id,
      rps: readRps,
      networkLatencyMs: getRegionLatencyMs(serviceRegionId, readDeployment.regionId),
      kind: "read",
    });
  }

  events.push({
    type: "traffic_routed",
    connectionId: edgeId,
    componentId: postgres.id,
    data: {
      readRequestsPerSecond: routedReadRps,
      writeRequestsPerSecond: routedWriteRps,
      kind: "read_write",
      serviceRegion: serviceRegionId,
      writeRegion: writeDeployment?.regionId ?? "",
      readRegion: readDeployment?.regionId ?? "",
    },
  });
}
