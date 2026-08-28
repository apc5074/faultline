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
  selectNearestHealthyDeployments,
  selectPostgresDeploymentForTraffic,
  selectRedisDeploymentForServiceRegion,
  serviceDeploymentCandidates,
  type DeploymentCandidate,
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
import { evaluateLevel2Workloads, type Level2SimulationResult } from "./level2.js";

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
    | "workload_channel_evaluated"
    | "queue_depth_changed"
    | "processing_work_completed"
    | "playback_path_evaluated"
    | "object_io_pressure"
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
      /** Deterministic multi-workload evidence, present for Level 2 challenges. */
      level2?: Level2SimulationResult;
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
 * Combine independent regional cache footprints for the component-level
 * result. Each footprint is evaluated separately before this aggregation so a
 * busy region cannot borrow unused capacity from another region.
 */
function aggregateCacheResults(
  results: readonly (CacheResult & CachePlacementEvidence)[],
): CacheResult & CachePlacementEvidence {
  const first = results[0];
  if (!first) {
    throw new Error("Cannot aggregate an empty cache result set.");
  }
  const eligibleRps = results.reduce((sum, result) => sum + result.eligibleRps, 0);
  const servedEligibleRps = results.reduce((sum, result) => sum + result.servedEligibleRps, 0);
  const hitRps = results.reduce((sum, result) => sum + result.hitRps, 0);
  const missRps = results.reduce((sum, result) => sum + result.missRps, 0);
  const capacityRps = results.reduce((sum, result) => sum + result.capacityRps, 0);
  return {
    ...first,
    eligibleRps,
    servedEligibleRps,
    hitRps,
    missRps,
    hitRate: eligibleRps > 0 ? hitRps / eligibleRps : 0,
    capacityRps,
    utilization: results.reduce((maximum, result) => Math.max(maximum, result.utilization), 0),
    saturated: results.some((result) => result.saturated),
    downstreamAvoidedRps: hitRps,
  };
}

/**
 * Propagates configured workload through the architecture graph.
 * Deterministic flow model only — not capacity or latency scoring.
 *
 * Geo mode (challenge geography active + ≥1 Service with deployments) follows
 * the absorb-then-route pipeline in docs/SIMULATOR.md (GEO-01 / plans/geo.md):
 * CDN absorb first → forward miss+writes → Router passthrough / LB policy split
 * on remaining → nearest healthy deployment **per Service share** → Redis/Postgres
 * store rules (GEO-02 CDN offload, GEO-03 miss-path LB).
 *
 * Logical mode: CDN/Redis absorb on the forward path as Phase 1/2.
 */
export function propagateTraffic({ architecture: input, challenge, registry, overlay }: TrafficPropagationInput): TrafficPropagationResult {
  const validation = validateArchitectureForSimulation({ architecture: input, challenge, registry });
  if (!validation.valid) return validation;

  const architecture = validation.architecture;
  const regionalWorkload = deriveRegionalWorkload(challenge);
  const useGeographicRouting = regionalWorkload.active && architectureHasServiceDeployments(architecture);

  const base = useGeographicRouting
    ? propagateGeographicTraffic(architecture, challenge, registry, regionalWorkload, overlay)
    : propagateLogicalTraffic(architecture, challenge, registry, regionalWorkload, overlay);
  if (!base.valid) return base;
  const level2 = evaluateLevel2Workloads({ architecture, challenge, registry, overlay });
  return level2 ? { ...base, level2, events: [...base.events, ...level2.events] } : base;
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

  type PlannedGeoRoute = {
    originRegion: RegionId;
    sourceId: string;
    rpsPerSource: number;
    /** First edge-cache (CDN) on the logical path, if any. */
    cdnComponentId: string | null;
    /** First Load Balancer on the miss path (after CDN), if any. */
    loadBalancerId: string | null;
    /** Reachable Services used when no LB fan-out applies. */
    reachableServices: ReturnType<typeof findReachableServices>;
  };

  const planned: PlannedGeoRoute[] = [];

  // Pass 1 — plan CDN ingress + miss-path LB (pre-absorb).
  for (const origin of regionalWorkload.origins) {
    const originRps = origin.redirectRps + origin.writeRps;
    if (originRps <= 0 || sources.length === 0) continue;

    const rpsPerSource = originRps / sources.length;
    for (const source of sources) {
      traffic[source.id].outgoingRps += rpsPerSource;

      const reachableServices = findReachableServices(architecture, [source.id], (component) =>
        isForwarder(component),
      ).filter((service) => !overlay?.failedComponentIds?.includes(service.id));
      if (reachableServices.length === 0) {
        unroutableRps += rpsPerSource;
        events.push({
          type: "traffic_routed",
          componentId: source.id,
          data: { requestsPerSecond: rpsPerSource, kind: "unroutable", originRegion: origin.regionId },
        });
        continue;
      }

      const pathServiceId = reachableServices[0].id;
      const cdnComponentId = findFirstEdgeCacheOnPath({
        architecture,
        registry,
        sourceId: source.id,
        serviceId: pathServiceId,
      });
      if (cdnComponentId) {
        traffic[cdnComponentId].incomingRps += rpsPerSource;
      }

      const loadBalancerId = findFirstLoadBalancerOnPath({
        architecture,
        registry,
        sourceId: source.id,
        serviceId: pathServiceId,
      });

      planned.push({
        originRegion: origin.regionId,
        sourceId: source.id,
        rpsPerSource,
        cdnComponentId,
        loadBalancerId,
        reachableServices,
      });
    }
  }

  // Evaluate each CDN once on total ingress (same as logical mode), then derive forward fraction.
  const cdnForwardFraction = new Map<string, number>();
  for (const forwarder of stableById(
    architecture.components.filter((component) => isEdgeCache(registry.get(component.type).simulation)),
  )) {
    const incoming = traffic[forwarder.id].incomingRps;
    if (incoming <= 0) continue;
    const parsed = registry.get(forwarder.type).configSchema.safeParse(forwarder.config);
    if (!parsed.success) continue;
    const cache = evaluateCdnCache(forwarder.id, incoming, parsed.data as CdnConfig, architecture, challenge, overlay, {
      geographicRoutingActive: true,
    });
    caches[forwarder.id] = cache;
    events.push(...cacheLoadEvents(forwarder.id, cache));
    const forwardRps = Math.max(0, incoming - cache.hitRps);
    cdnForwardFraction.set(forwarder.id, incoming > 0 ? forwardRps / incoming : 1);
    traffic[forwarder.id].outgoingRps += incoming;
  }

  const unroutable = {
    add: (rps: number) => {
      unroutableRps += rps;
    },
  };

  // Pass 2 — miss forwarders (Router/LB) then per-Service nearest deployment bind.
  for (const plan of planned) {
    const fraction =
      plan.cdnComponentId && cdnForwardFraction.has(plan.cdnComponentId)
        ? (cdnForwardFraction.get(plan.cdnComponentId) as number)
        : 1;
    const fullRps = plan.rpsPerSource;
    const forwardRps = fullRps * fraction;

    if (plan.loadBalancerId) {
      attributePassthroughPath({
        architecture,
        registry,
        sourceId: plan.sourceId,
        serviceId: plan.loadBalancerId,
        fullRps,
        forwardRps,
        cdnComponentId: plan.cdnComponentId,
        traffic,
        events,
        originRegion: plan.originRegion,
        countTerminalIncoming: true,
      });

      const lbEdges = requestEdgesFrom(architecture, plan.loadBalancerId).filter(
        (edge) => !overlay?.failedComponentIds?.includes(edge.targetComponentId),
      );
      if (lbEdges.length === 0) {
        if (forwardRps > 0) {
          unroutableRps += forwardRps;
          events.push({
            type: "traffic_routed",
            componentId: plan.loadBalancerId,
            data: { requestsPerSecond: forwardRps, kind: "unroutable", originRegion: plan.originRegion },
          });
        }
        traffic[plan.loadBalancerId].outgoingRps += forwardRps;
        continue;
      }

      const allocations = allocateForwardedRequestRps(
        forwardRps,
        lbEdges,
        architecture,
        registry,
        plan.loadBalancerId,
        challenge,
      );
      traffic[plan.loadBalancerId].outgoingRps += forwardRps;

      for (const { edge, rps } of allocations) {
        if (rps <= 0) continue;
        const target = architecture.components.find((component) => component.id === edge.targetComponentId);
        if (!target) continue;

        events.push({
          type: "traffic_routed",
          connectionId: edge.id,
          componentId: target.id,
          data: { requestsPerSecond: rps, kind: "request", originRegion: plan.originRegion },
        });

        if (target.type === "service") {
          placeGeographicServiceAllocation({
            architecture,
            challenge,
            registry,
            overlay,
            service: target,
            allocatedRps: rps,
            originRegion: plan.originRegion,
            traffic,
            regionalTraffic,
            geographicRoutes,
            events,
            unroutable,
          });
          continue;
        }

        if (forwardsRequests(registry.get(target.type).simulation)) {
          traffic[target.id].incomingRps += rps;
          const nestedServices = findReachableServices(architecture, [target.id], (component) =>
            isForwarder(component),
          ).filter((service) => !overlay?.failedComponentIds?.includes(service.id));
          const nestedSelected = selectNearestHealthyDeployments(
            plan.originRegion,
            serviceDeploymentCandidates(nestedServices),
            overlay?.failedRegionIds,
          );
          if (nestedSelected.length === 0) {
            unroutableRps += rps;
            continue;
          }
          for (const selected of nestedSelected) {
            const share = rps / nestedSelected.length;
            const service = architecture.components.find((component) => component.id === selected.componentId);
            if (!service) continue;
            placeGeographicServiceOnDeployment({
              architecture,
              challenge,
              registry,
              overlay,
              service,
              selected,
              forwardRps: share,
              originRegion: plan.originRegion,
              traffic,
              regionalTraffic,
              geographicRoutes,
              events,
              unroutable,
            });
          }
          continue;
        }

        unroutableRps += rps;
      }
      continue;
    }

    // No LB: nearest-healthy among all reachable Service deployments (Router is passthrough).
    const selectedDeployments = selectNearestHealthyDeployments(
      plan.originRegion,
      serviceDeploymentCandidates(plan.reachableServices),
      overlay?.failedRegionIds,
    );
    if (selectedDeployments.length === 0) {
      if (forwardRps > 0) {
        unroutableRps += forwardRps;
        events.push({
          type: "traffic_routed",
          componentId: plan.sourceId,
          data: { requestsPerSecond: forwardRps, kind: "unroutable", originRegion: plan.originRegion },
        });
      }
      continue;
    }

    for (const selected of selectedDeployments) {
      const fullShare = fullRps / selectedDeployments.length;
      const forwardShare = forwardRps / selectedDeployments.length;
      attributePassthroughPath({
        architecture,
        registry,
        sourceId: plan.sourceId,
        serviceId: selected.componentId,
        fullRps: fullShare,
        forwardRps: forwardShare,
        cdnComponentId: plan.cdnComponentId,
        traffic,
        events,
        originRegion: plan.originRegion,
      });
      const service = architecture.components.find((component) => component.id === selected.componentId);
      if (!service || forwardShare <= 0) continue;
      placeGeographicServiceOnDeployment({
        architecture,
        challenge,
        registry,
        overlay,
        service,
        selected,
        forwardRps: forwardShare,
        originRegion: plan.originRegion,
        traffic,
        regionalTraffic,
        geographicRoutes,
        events,
        unroutable,
      });
    }
  }

  for (const passthrough of stableById(
    architecture.components.filter(
      (component) => component.type === "global-router" || component.type === "load-balancer",
    ),
  )) {
    if (traffic[passthrough.id].incomingRps > traffic[passthrough.id].outgoingRps) {
      traffic[passthrough.id].outgoingRps = traffic[passthrough.id].incomingRps;
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

    const redisConfig = parsed.data as RedisConfig;
    const regionalCacheResults =
      cacheComponent.deployments.length > 0
        ? regionEntries.map(({ entry }) =>
            evaluateRedisCache(
              cacheComponent.id,
              entry.readRps,
              redisConfig,
              architecture,
              challenge,
              overlay,
              { geographicRoutingActive: true },
            ),
          )
        : [
            evaluateRedisCache(
              cacheComponent.id,
              pendingReads,
              redisConfig,
              architecture,
              challenge,
              overlay,
              { geographicRoutingActive: true },
            ),
          ];
    const cache = aggregateCacheResults(regionalCacheResults);
    caches[cacheComponent.id] = cache;
    events.push(...cacheLoadEvents(cacheComponent.id, cache));

    let forwardedTotal = 0;
    for (const [regionIndex, { regionId, entry }] of regionEntries.entries()) {
      const serviceRegion: RegionId = isValidRegion(regionId) ? regionId : "us-east";
      const regionalCache = regionalCacheResults[regionIndex] ?? cache;
      const regionalHitRate = entry.readRps > 0 ? regionalCache.hitRps / entry.readRps : 0;
      const regionForwardReads = entry.readRps * (1 - regionalHitRate);
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

/** First CDN (edge cache) on the deterministic request path from source toward service. */
function findFirstEdgeCacheOnPath(input: {
  architecture: Architecture;
  registry: ComponentRegistry;
  sourceId: string;
  serviceId: string;
}): string | null {
  return findFirstComponentOnPath({
    ...input,
    match: (component) => isEdgeCache(input.registry.get(component.type).simulation),
  });
}

/** First Load Balancer on the miss path (CDN/Router may precede it). */
function findFirstLoadBalancerOnPath(input: {
  architecture: Architecture;
  registry: ComponentRegistry;
  sourceId: string;
  serviceId: string;
}): string | null {
  return findFirstComponentOnPath({
    ...input,
    match: (component) => component.type === "load-balancer",
  });
}

function findFirstComponentOnPath(input: {
  architecture: Architecture;
  registry: ComponentRegistry;
  sourceId: string;
  serviceId: string;
  match: (component: { id: string; type: string }) => boolean;
}): string | null {
  const { architecture, registry, sourceId, serviceId, match } = input;
  const byId = new Map(architecture.components.map((component) => [component.id, component]));
  let currentId = sourceId;
  const visited = new Set<string>();

  while (currentId !== serviceId && !visited.has(currentId)) {
    visited.add(currentId);
    const edges = requestEdgesFrom(architecture, currentId);
    if (edges.length === 0) break;

    let chosen = edges[0];
    for (const edge of edges) {
      if (
        canReachAlongRequestPath({
          architecture,
          registry,
          fromComponentId: edge.targetComponentId,
          terminalId: serviceId,
        })
      ) {
        chosen = edge;
        break;
      }
    }

    const target = byId.get(chosen.targetComponentId);
    if (!target) break;
    if (target.id === serviceId) break;
    if (match(target)) return target.id;
    if (forwardsRequests(registry.get(target.type).simulation) || target.type === "traffic-source") {
      currentId = target.id;
      continue;
    }
    break;
  }
  return null;
}

/** True when terminal is reachable through forwarders without inventing edges. */
function canReachAlongRequestPath(input: {
  architecture: Architecture;
  registry: ComponentRegistry;
  fromComponentId: string;
  terminalId: string;
}): boolean {
  const { architecture, registry, fromComponentId, terminalId } = input;
  if (fromComponentId === terminalId) return true;
  const byId = new Map(architecture.components.map((component) => [component.id, component]));
  const visited = new Set<string>();
  const pending = [fromComponentId];

  while (pending.length > 0) {
    const currentId = pending.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    if (currentId === terminalId) return true;
    const current = byId.get(currentId);
    if (!current) continue;
    if (current.type === "service") continue;
    if (current.type === "traffic-source" || forwardsRequests(registry.get(current.type).simulation)) {
      for (const edge of requestEdgesFrom(architecture, current.id)) {
        if (!visited.has(edge.targetComponentId)) pending.push(edge.targetComponentId);
      }
    }
  }
  return false;
}

/**
 * Walk a deterministic request path from traffic source toward a terminal component
 * (Service or miss-path LB). Pre-CDN hops use fullRps; post-CDN hops use forwardRps.
 * CDN ingress is pre-accumulated in pass 1 — this walk does not double-count it.
 */
function attributePassthroughPath(input: {
  architecture: Architecture;
  registry: ComponentRegistry;
  sourceId: string;
  serviceId: string;
  fullRps: number;
  forwardRps: number;
  cdnComponentId: string | null;
  traffic: Record<string, ComponentTraffic>;
  events: SimulationEvent[];
  originRegion: string;
  /** When true, add forwardRps to the terminal component's incoming (LB stop). */
  countTerminalIncoming?: boolean;
}): void {
  const {
    architecture,
    registry,
    sourceId,
    serviceId,
    fullRps,
    forwardRps,
    cdnComponentId,
    traffic,
    events,
    originRegion,
    countTerminalIncoming = false,
  } = input;
  const byId = new Map(architecture.components.map((component) => [component.id, component]));
  let currentId = sourceId;
  const visited = new Set<string>();
  let pastCdn = cdnComponentId === null;

  while (currentId !== serviceId && !visited.has(currentId)) {
    visited.add(currentId);
    const edges = requestEdgesFrom(architecture, currentId);
    if (edges.length === 0) break;

    let chosen = edges[0];
    for (const edge of edges) {
      if (
        canReachAlongRequestPath({
          architecture,
          registry,
          fromComponentId: edge.targetComponentId,
          terminalId: serviceId,
        })
      ) {
        chosen = edge;
        break;
      }
    }

    const target = byId.get(chosen.targetComponentId);
    if (!target) break;

    const hopRps = pastCdn ? forwardRps : fullRps;
    if (hopRps <= 0 && target.id !== cdnComponentId) break;

    if (target.id === serviceId) {
      if (countTerminalIncoming && forwardRps > 0) {
        traffic[target.id].incomingRps += forwardRps;
      }
      events.push({
        type: "traffic_routed",
        connectionId: chosen.id,
        componentId: target.id,
        data: { requestsPerSecond: forwardRps, kind: "request", originRegion },
      });
      break;
    }

    if (forwardsRequests(registry.get(target.type).simulation) || target.type === "traffic-source") {
      if (target.id === cdnComponentId) {
        // Ingress already counted in planning pass; emit edge evidence at full demand.
        events.push({
          type: "traffic_routed",
          connectionId: chosen.id,
          componentId: target.id,
          data: { requestsPerSecond: fullRps, kind: "request", originRegion },
        });
        pastCdn = true;
      } else if (hopRps > 0) {
        traffic[target.id].incomingRps += hopRps;
        events.push({
          type: "traffic_routed",
          connectionId: chosen.id,
          componentId: target.id,
          data: { requestsPerSecond: hopRps, kind: "request", originRegion },
        });
      }
      currentId = target.id;
      continue;
    }

    break;
  }
}

/** LB share → nearest healthy deployment(s) within that Service only. */
function placeGeographicServiceAllocation(input: {
  architecture: Architecture;
  challenge: ChallengeDefinition;
  registry: ComponentRegistry;
  overlay?: ExperimentOverlay;
  service: import("@faultline/core").ComponentInstance;
  allocatedRps: number;
  originRegion: RegionId;
  traffic: Record<string, ComponentTraffic>;
  regionalTraffic: Record<string, Record<string, RegionalComponentTraffic>>;
  geographicRoutes: GeographicRoute[];
  events: SimulationEvent[];
  unroutable: { add: (rps: number) => void };
}): void {
  const { service, allocatedRps, originRegion, overlay } = input;
  if (allocatedRps <= 0) return;

  const selected = selectNearestHealthyDeployments(
    originRegion,
    serviceDeploymentCandidates([service]),
    overlay?.failedRegionIds,
  );
  if (selected.length === 0) {
    input.unroutable.add(allocatedRps);
    input.events.push({
      type: "traffic_routed",
      componentId: service.id,
      data: { requestsPerSecond: allocatedRps, kind: "unroutable", originRegion },
    });
    return;
  }

  for (const deployment of selected) {
    placeGeographicServiceOnDeployment({
      ...input,
      selected: deployment,
      forwardRps: allocatedRps / selected.length,
    });
  }
}

function placeGeographicServiceOnDeployment(input: {
  architecture: Architecture;
  challenge: ChallengeDefinition;
  registry: ComponentRegistry;
  overlay?: ExperimentOverlay;
  service: import("@faultline/core").ComponentInstance;
  selected: DeploymentCandidate;
  forwardRps: number;
  originRegion: RegionId;
  traffic: Record<string, ComponentTraffic>;
  regionalTraffic: Record<string, Record<string, RegionalComponentTraffic>>;
  geographicRoutes: GeographicRoute[];
  events: SimulationEvent[];
  unroutable: { add: (rps: number) => void };
}): void {
  const {
    architecture,
    challenge,
    overlay,
    service,
    selected,
    forwardRps,
    originRegion,
    traffic,
    regionalTraffic,
    geographicRoutes,
    events,
    unroutable,
  } = input;
  if (forwardRps <= 0) return;

  const networkLatencyMs = getRegionLatencyMs(originRegion, selected.regionId);
  traffic[selected.componentId].incomingRps += forwardRps;
  addRegionalTraffic(regionalTraffic, selected.componentId, selected.regionId, {
    incomingRps: forwardRps,
  });
  geographicRoutes.push({
    originRegion,
    destinationRegion: selected.regionId,
    componentId: selected.componentId,
    deploymentId: selected.deployment.id,
    rps: forwardRps,
    networkLatencyMs,
    kind: "request",
  });
  events.push({
    type: "traffic_routed",
    componentId: selected.componentId,
    data: {
      requestsPerSecond: forwardRps,
      kind: "request",
      originRegion,
      destinationRegion: selected.regionId,
      deploymentId: selected.deployment.id,
      networkLatencyMs,
    },
  });

  const readRps = forwardRps * challenge.workload.readRatio;
  const writeRps = forwardRps * challenge.workload.writeRatio;
  traffic[service.id].outgoingRps += forwardRps;

  const dbEdges = databaseEdgesFrom(architecture, service.id);
  if (dbEdges.length === 0) return;
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
        networkLatencyMs: redisDeployment ? getRegionLatencyMs(selected.regionId, redisDeployment.regionId) : 0,
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
        unroutable,
      });
    }
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

  // Empty deployments = logical whole-component store (same as Redis footprints).
  // Geography may place Services without requiring Postgres POPs yet.
  if (postgres.deployments.length === 0) {
    traffic[postgres.id].incomingRps += readRps + writeRps;
    traffic[postgres.id].readRps += readRps;
    traffic[postgres.id].writeRps += writeRps;
    events.push({
      type: "traffic_routed",
      connectionId: edgeId,
      componentId: postgres.id,
      data: {
        readRequestsPerSecond: readRps,
        writeRequestsPerSecond: writeRps,
        kind: "read_write",
        serviceRegion: serviceRegionId,
      },
    });
    return;
  }

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
