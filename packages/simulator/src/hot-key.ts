import {
  cdnHitRateForConfig,
  cdnThroughputCapacityForConfig,
  postgresPrimaryReadCapacity,
  redisEffectiveModel,
  redisHitRateForConfig,
  serviceCapacityForConfig,
  type CdnConfig,
  type LoadBalancerConfig,
  type PostgresConfig,
  type RedisConfig,
  type ServiceConfig,
} from "@faultline/component-catalog";
import type { Architecture, ChallengeDefinition, Connection } from "@faultline/core";

import { evaluateCacheOffload } from "./cache.js";
import type { TrafficPropagationInput } from "./traffic.js";
import {
  hotKeyViralRedirectRpsWithReuseConcentration,
  resolveCacheConfiguredHitRate,
} from "./workload-affinity.js";
import { architectureHasServiceDeployments } from "./geographic-routing.js";
import { validateArchitectureForSimulation, type SimulationValidationError } from "./validation.js";

export interface HotKeyHop {
  componentId: string;
  componentType: string;
  incomingViralRps: number;
  absorbedViralRps: number;
  forwardedViralRps: number;
  hotKeyCapacityRps: number | null;
  hotKeyUtilization: number | null;
  saturated: boolean;
}

export interface HotKeyScenarioResult {
  /** False when the challenge does not define a hot-key fraction. */
  active: boolean;
  viralRedirectRps: number;
  hops: readonly HotKeyHop[];
  viralReachingPostgresRps: number;
  saturatedComponentIds: readonly string[];
  passed: boolean;
  explanation: string;
}

export type HotKeyEvaluationResult =
  | { valid: true; hotKey: HotKeyScenarioResult }
  | { valid: false; errors: readonly SimulationValidationError[] };

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

function inactiveResult(): HotKeyScenarioResult {
  return {
    active: false,
    viralRedirectRps: 0,
    hops: [],
    viralReachingPostgresRps: 0,
    saturatedComponentIds: [],
    passed: true,
    explanation: "No hot-key scenario is configured for this challenge.",
  };
}

function allocateEqual(pendingRps: number, edges: readonly Connection[]): readonly { edge: Connection; rps: number }[] {
  if (edges.length === 0 || pendingRps <= 0) return [];
  const share = pendingRps / edges.length;
  return edges.map((edge) => ({ edge, rps: share }));
}

function allocateByServiceCapacity(
  pendingRps: number,
  edges: readonly Connection[],
  architecture: Architecture,
  registry: TrafficPropagationInput["registry"],
  policy: LoadBalancerConfig["policy"] | undefined,
): readonly { edge: Connection; rps: number }[] {
  if (policy !== "capacity_weighted") return allocateEqual(pendingRps, edges);
  const weights = edges.map((edge) => {
    const target = architecture.components.find((component) => component.id === edge.targetComponentId);
    if (!target || target.type !== "service") return 0;
    const parsed = registry.get("service").configSchema.safeParse(target.config);
    if (!parsed.success) return 0;
    return serviceCapacityForConfig(parsed.data as ServiceConfig);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return allocateEqual(pendingRps, edges);
  return edges.map((edge, index) => ({ edge, rps: (pendingRps * weights[index]) / total }));
}

/**
 * Deterministic viral-key scenario.
 *
 * Aggregate utilization cannot hide a concentrated key: Redis uses per-key capacity,
 * and Postgres hot-key pressure is evaluated against primary read capacity only
 * (replicas do not shard a single viral key).
 */
export function evaluateHotKeyScenario(input: TrafficPropagationInput): HotKeyEvaluationResult {
  const validation = validateArchitectureForSimulation(input);
  if (!validation.valid) return validation;

  const challenge = input.challenge as ChallengeDefinition;
  const baseViralRedirectRps = viralRedirectRpsForChallenge(challenge);
  const viralRedirectRps = hotKeyViralRedirectRpsWithReuseConcentration(challenge, baseViralRedirectRps);
  if (viralRedirectRps <= 0) return { valid: true, hotKey: inactiveResult() };

  const architecture = validation.architecture;
  const registry = input.registry;
  const geographicRoutingActive =
    challenge.geographicDistribution !== undefined && architectureHasServiceDeployments(architecture);

  const incoming = Object.fromEntries(architecture.components.map((component) => [component.id, 0])) as Record<
    string,
    number
  >;
  const forwardedOut = Object.fromEntries(architecture.components.map((component) => [component.id, 0])) as Record<
    string,
    number
  >;
  const hopById = new Map<string, HotKeyHop>();

  const sources = stableById(architecture.components.filter((component) => component.type === "traffic-source"));
  const viralPerSource = viralRedirectRps / Math.max(sources.length, 1);
  for (const source of sources) {
    for (const { edge, rps } of allocateEqual(viralPerSource, requestEdgesFrom(architecture, source.id))) {
      incoming[edge.targetComponentId] += rps;
    }
  }

  for (let pass = 0; pass < architecture.components.length + 2; pass += 1) {
    let progressed = false;
    for (const component of stableById(architecture.components)) {
      const pending = incoming[component.id] - forwardedOut[component.id];
      if (pending <= 0) continue;
      progressed = true;

      const definition = registry.get(component.type);
      let absorbed = 0;
      let forward = pending;
      let hotKeyCapacityRps: number | null = null;
      let hotKeyUtilization: number | null = null;
      let saturated = false;

      if (component.type === "cdn") {
        const parsed = definition.configSchema.safeParse(component.config);
        if (parsed.success) {
          const config = parsed.data as CdnConfig;
          const eligible = pending * config.coverage;
          const { finalConfiguredHitRate } = resolveCacheConfiguredHitRate({
            componentId: component.id,
            catalogType: "cdn",
            playerIntent: cdnHitRateForConfig(config),
            architecture,
            challenge,
          });
          const cache = evaluateCacheOffload({
            eligibleRps: eligible,
            configuredHitRate: finalConfiguredHitRate,
            capacityRps: cdnThroughputCapacityForConfig(config),
          });
          absorbed = cache.hitRps;
          forward = pending - absorbed;
          hotKeyCapacityRps = cdnThroughputCapacityForConfig(config);
          hotKeyUtilization = hotKeyCapacityRps > 0 ? eligible / hotKeyCapacityRps : null;
          saturated = cache.saturated;
        }
      } else if (component.type === "redis") {
        const parsed = definition.configSchema.safeParse(component.config);
        if (parsed.success) {
          const config = parsed.data as RedisConfig;
          const model = redisEffectiveModel(config);
          const footprintCount = geographicRoutingActive ? Math.max(1, component.deployments.length) : 1;
          // Regional Redis footprints receive independent origin shares. Their
          // hot-key capacity sums; replicated mode still does not shard a key.
          hotKeyCapacityRps = model.hotKeyCapacityRps * footprintCount;
          hotKeyUtilization = hotKeyCapacityRps > 0 ? pending / hotKeyCapacityRps : null;
          saturated = pending > model.hotKeyCapacityRps;
          const { finalConfiguredHitRate } = resolveCacheConfiguredHitRate({
            componentId: component.id,
            catalogType: "redis",
            playerIntent: redisHitRateForConfig(config),
            architecture,
            challenge,
          });
          const cache = evaluateCacheOffload({
            eligibleRps: pending,
            configuredHitRate: finalConfiguredHitRate,
            capacityRps: Math.min(model.throughputRps, model.hotKeyCapacityRps) * footprintCount,
          });
          absorbed = cache.hitRps;
          forward = cache.missRps;
        }
      } else if (component.type === "postgres") {
        const parsed = definition.configSchema.safeParse(component.config);
        if (parsed.success) {
          const config = parsed.data as PostgresConfig;
          hotKeyCapacityRps = postgresPrimaryReadCapacity(config);
          hotKeyUtilization = hotKeyCapacityRps > 0 ? pending / hotKeyCapacityRps : null;
          saturated = pending > hotKeyCapacityRps;
          absorbed = 0;
          forward = 0;
        }
      }

      const existing = hopById.get(component.id);
      hopById.set(component.id, {
        componentId: component.id,
        componentType: component.type,
        incomingViralRps: incoming[component.id],
        absorbedViralRps: (existing?.absorbedViralRps ?? 0) + absorbed,
        forwardedViralRps: (existing?.forwardedViralRps ?? 0) + forward,
        hotKeyCapacityRps,
        hotKeyUtilization,
        saturated: (existing?.saturated ?? false) || saturated,
      });

      // Mark this pending slice as handled before routing downstream.
      forwardedOut[component.id] += pending;
      if (forward <= 0) continue;

      if (component.type === "service" || component.type === "redis") {
        for (const { edge, rps } of allocateEqual(forward, databaseEdgesFrom(architecture, component.id))) {
          incoming[edge.targetComponentId] += rps;
        }
        continue;
      }

      if (
        component.type === "cdn" ||
        component.type === "global-router" ||
        component.type === "load-balancer"
      ) {
        let policy: LoadBalancerConfig["policy"] | undefined;
        if (component.type === "load-balancer") {
          const parsed = definition.configSchema.safeParse(component.config);
          if (parsed.success) policy = (parsed.data as LoadBalancerConfig).policy;
        }
        for (const { edge, rps } of allocateByServiceCapacity(
          forward,
          requestEdgesFrom(architecture, component.id),
          architecture,
          registry,
          policy,
        )) {
          incoming[edge.targetComponentId] += rps;
        }
      }
    }
    if (!progressed) break;
  }

  const hops = [...hopById.values()].sort((left, right) => left.componentId.localeCompare(right.componentId));
  const saturatedComponentIds = hops
    .filter((hop) => hop.saturated)
    .map((hop) => hop.componentId)
    .sort((left, right) => left.localeCompare(right));

  const viralReachingPostgresRps = hops
    .filter((hop) => hop.componentType === "postgres")
    .reduce((sum, hop) => sum + hop.incomingViralRps, 0);

  const passed = saturatedComponentIds.length === 0;
  const explanation = !passed
    ? `Hot-key scenario failed: viral traffic saturated ${saturatedComponentIds
        .map((id) => {
          const hop = hops.find((candidate) => candidate.componentId === id);
          return hop ? `${hop.componentType} "${id}"` : id;
        })
        .join(", ")}.`
    : viralReachingPostgresRps > 0
      ? `Hot-key scenario passed: ${viralRedirectRps.toLocaleString("en-US")} viral redirects/sec were handled without hot-path saturation (${viralReachingPostgresRps.toLocaleString("en-US")} reached Postgres).`
      : `Hot-key scenario passed: ${viralRedirectRps.toLocaleString("en-US")} viral redirects/sec were absorbed before Postgres without hot-path saturation.`;

  return {
    valid: true,
    hotKey: {
      active: true,
      viralRedirectRps,
      hops,
      viralReachingPostgresRps,
      saturatedComponentIds,
      passed,
      explanation,
    },
  };
}

/** Resolve viral redirect RPS from challenge workload config. */
export function viralRedirectRpsForChallenge(challenge: ChallengeDefinition): number {
  const fraction = challenge.workload.hotKeyReadFraction ?? 0;
  if (fraction <= 0) return 0;
  return challenge.workload.requestsPerSecond * challenge.workload.readRatio * fraction;
}
