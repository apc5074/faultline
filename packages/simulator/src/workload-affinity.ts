/**
 * Placement-aware workload affinity — single source of truth for:
 *   - which mechanism job a catalog type performs (`mechanismIdForCatalogType`)
 *   - where a component instance sits in the request/data graph (`resolveNodeRole`)
 *   - how a challenge's mechanism ceiling and role multiplier combine (`resolveMechanismAffinity`,
 *     `roleMultiplier`, `effectiveEffectiveness`)
 *
 * Pure and topology-only. No challenge-slug branches: every role predicate reads the graph
 * (component types, request/read_write edges), never `challenge.slug`.
 *
 */

import type { Architecture, ArchitecturalRoleId, ChallengeDefinition, Connection, MechanismAffinity, WorkloadMechanismId } from "@faultline/core";

import type { CachePlacementEvidence } from "./cache.js";

/** Level 1 catalog type → mechanism job. Adding a component extends this map, never a slug branch. */
const CATALOG_TYPE_TO_MECHANISM: Readonly<Record<string, WorkloadMechanismId>> = {
  cdn: "edge_cache",
  redis: "data_cache",
  "load-balancer": "request_fanout",
  "global-router": "geo_routing",
  service: "stateless_compute",
  postgres: "durable_store",
  "object-storage": "object_store",
  queue: "async_buffer",
  worker: "async_consumer",
};

/** Traffic sources and any future unmapped catalog type return `null` — no mechanism, no affinity scoring. */
export function mechanismIdForCatalogType(catalogType: string): WorkloadMechanismId | null {
  return CATALOG_TYPE_TO_MECHANISM[catalogType] ?? null;
}

export interface RoleResolutionContext {
  /**
   * True when this run's geographic routing is active (`deriveRegionalWorkload(challenge).active`
   * with regional service deployments — see `packages/simulator/src/traffic.ts`). Lets a
   * `geo_routing` mechanism resolve to `geo_route` instead of plain `path_middleware`.
   */
  geographicRoutingActive?: boolean;
}

function componentType(architecture: Architecture, id: string): string | undefined {
  return architecture.components.find((component) => component.id === id)?.type;
}

function edgesOfType(architecture: Architecture, type: Connection["type"]): Connection[] {
  return architecture.connections.filter((connection) => connection.type === type);
}

/**
 * BFS over `request` edges starting from every `traffic-source` component.
 * With `stopAtService`, a `service` node is reached (included) but its outgoing edges are not
 * traversed — this isolates "reachable before compute" from "reachable at all", which is what
 * separates an edge-cache's `edge_ingress` role from a downstream `path_middleware` placement.
 */
function reachableViaRequestEdges(architecture: Architecture, options: { stopAtService: boolean }): Set<string> {
  const edges = edgesOfType(architecture, "request");
  const sourceIds = architecture.components.filter((component) => component.type === "traffic-source").map((component) => component.id);
  const visited = new Set<string>(sourceIds);
  const queue = [...sourceIds];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (options.stopAtService && componentType(architecture, current) === "service") continue;
    for (const edge of edges) {
      if (edge.sourceComponentId !== current || visited.has(edge.targetComponentId)) continue;
      visited.add(edge.targetComponentId);
      queue.push(edge.targetComponentId);
    }
  }
  return visited;
}

/** BFS over `read_write` edges starting from the given seed component IDs. */
function dataReachableFrom(architecture: Architecture, seeds: Iterable<string>): Set<string> {
  const edges = edgesOfType(architecture, "read_write");
  const visited = new Set<string>(seeds);
  const queue = [...visited];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const edge of edges) {
      if (edge.sourceComponentId !== current || visited.has(edge.targetComponentId)) continue;
      visited.add(edge.targetComponentId);
      queue.push(edge.targetComponentId);
    }
  }
  return visited;
}

function hasIncomingEdgeFrom(architecture: Architecture, nodeId: string, type: Connection["type"], sourceTypes: readonly string[]): boolean {
  return edgesOfType(architecture, type).some((edge) => edge.targetComponentId === nodeId && sourceTypes.includes(componentType(architecture, edge.sourceComponentId) ?? ""));
}

/**
 * Derives the architectural role of one node from graph position alone.
 *
 * Role definitions follow plans/level/plan.md strictly: `unreachable` means no traffic can reach
 * the node at all; `misplaced` means it is reachable but its wiring does not match any productive
 * pattern for its mechanism. A cache wired directly from a traffic source via a `read_write` edge
 * (skipping compute) resolves `unreachable`, not `misplaced` — the current traffic propagation
 * model only originates database-edge traffic from services/caches (see traffic.ts), so that
 * wiring genuinely carries zero traffic today, not merely "the wrong kind of traffic."
 */
export function resolveNodeRole(architecture: Architecture, nodeId: string, context: RoleResolutionContext = {}): ArchitecturalRoleId {
  const type = componentType(architecture, nodeId);
  const mechanismId = type === undefined ? null : mechanismIdForCatalogType(type);

  const requestReachable = reachableViaRequestEdges(architecture, { stopAtService: false });
  const requestReachableBeforeCompute = reachableViaRequestEdges(architecture, { stopAtService: true });
  const computeReachable = new Set([...requestReachable].filter((id) => componentType(architecture, id) === "service"));
  const dataReachable = dataReachableFrom(architecture, computeReachable);

  switch (mechanismId) {
    case "edge_cache":
      if (!requestReachable.has(nodeId)) return "unreachable";
      return requestReachableBeforeCompute.has(nodeId) ? "edge_ingress" : "path_middleware";

    case "request_fanout":
      return requestReachable.has(nodeId) ? "path_middleware" : "unreachable";

    case "geo_routing":
      if (!requestReachable.has(nodeId)) return "unreachable";
      return context.geographicRoutingActive ? "geo_route" : "path_middleware";

    case "stateless_compute":
      return computeReachable.has(nodeId) ? "compute" : "unreachable";

    case "data_cache": {
      const incoming = edgesOfType(architecture, "read_write").filter((edge) => edge.targetComponentId === nodeId);
      const reachableIncoming = incoming.filter(
        (edge) => computeReachable.has(edge.sourceComponentId) || dataReachable.has(edge.sourceComponentId),
      );
      if (reachableIncoming.length === 0) return "unreachable";

      const outgoing = edgesOfType(architecture, "read_write").filter((edge) => edge.sourceComponentId === nodeId);
      const feedsDurableStore = outgoing.some((edge) => {
        const targetType = componentType(architecture, edge.targetComponentId);
        return targetType !== undefined && mechanismIdForCatalogType(targetType) === "durable_store";
      });
      return feedsDurableStore ? "read_aside" : "misplaced";
    }

    case "durable_store":
      return dataReachable.has(nodeId) ? "primary_store" : "unreachable";

    case "object_store":
      return hasIncomingEdgeFrom(architecture, nodeId, "object_io", ["service", "worker"]) ? "object_store" : "unreachable";

    case "async_buffer":
      return hasIncomingEdgeFrom(architecture, nodeId, "async_work", ["service"]) ? "async_buffer" : "unreachable";

    case "async_consumer":
      return hasIncomingEdgeFrom(architecture, nodeId, "async_work", ["queue"]) ? "async_consumer" : "unreachable";

    default:
      // Unmapped catalog type (including traffic sources): topology-only fallback.
      if (requestReachable.has(nodeId) || dataReachable.has(nodeId)) return "path_middleware";
      return "unreachable";
  }
}

/** Baseline ceiling when a challenge omits `workloadAffinity` entirely (legacy behavior). */
const LEGACY_MECHANISM_AFFINITY: MechanismAffinity = { maxEffectiveness: 1 };

/**
 * Built-in role multipliers applied when neither the mechanism's `byRole`/`defaultRoleMultiplier`
 * nor the challenge's `roleDefaults` resolve the role. Keeps placement meaningful even on
 * challenges (e.g. Tiny API) that never author `workloadAffinity`.
 */
export const SIMULATOR_DEFAULT_ROLE_MULTIPLIERS: Readonly<Partial<Record<ArchitecturalRoleId, number>>> = {
  unreachable: 0,
  misplaced: 0.05,
};

const DEFAULT_ROLE_MULTIPLIER = 1;

/** Resolves the challenge's authored affinity for one mechanism, or the legacy ceiling-1.0 default. */
export function resolveMechanismAffinity(challenge: ChallengeDefinition, mechanismId: WorkloadMechanismId): MechanismAffinity {
  return challenge.workloadAffinity?.mechanisms[mechanismId] ?? LEGACY_MECHANISM_AFFINITY;
}

/**
 * Resolves a role's multiplier (0..1) against one mechanism's affinity, falling through:
 * mechanism `byRole` → mechanism `defaultRoleMultiplier` → challenge `roleDefaults` →
 * simulator built-in default → 1.0.
 */
export function roleMultiplier(
  affinity: MechanismAffinity,
  role: ArchitecturalRoleId,
  challengeRoleDefaults?: Partial<Record<ArchitecturalRoleId, number>>,
): number {
  const byRole = affinity.byRole?.[role];
  if (byRole !== undefined) return byRole;
  if (affinity.defaultRoleMultiplier !== undefined) return affinity.defaultRoleMultiplier;
  const challengeDefault = challengeRoleDefaults?.[role];
  if (challengeDefault !== undefined) return challengeDefault;
  const simulatorDefault = SIMULATOR_DEFAULT_ROLE_MULTIPLIERS[role];
  if (simulatorDefault !== undefined) return simulatorDefault;
  return DEFAULT_ROLE_MULTIPLIER;
}

export interface EffectiveEffectivenessInput {
  challenge: ChallengeDefinition;
  catalogType: string;
  nodeId: string;
  architecture: Architecture;
  /** Player-authored dial intent for this node (0..1) — TTL/coverage/size/etc, subsystem-specific. */
  playerIntent: number;
  context?: RoleResolutionContext;
}

export interface EffectiveEffectivenessResult {
  mechanismId: WorkloadMechanismId | null;
  role: ArchitecturalRoleId | null;
  /** `maxEffectiveness × roleMultiplier`, or null when the catalog type has no mechanism. */
  challengeCeiling: number | null;
  playerIntent: number;
  /** `challengeCeiling × playerIntent`, or `playerIntent` unchanged when there is no mechanism. */
  effective: number;
}

/**
 * Combines challenge-authored mechanism ceiling, derived architectural role, and player intent
 * into one effective benefit. A catalog type with no mechanism (e.g. `traffic-source`, or any
 * future type not yet in `mechanismIdForCatalogType`) passes `playerIntent` through unscored.
 */
export function effectiveEffectiveness(input: EffectiveEffectivenessInput): EffectiveEffectivenessResult {
  const { challenge, catalogType, nodeId, architecture, playerIntent, context } = input;
  const mechanismId = mechanismIdForCatalogType(catalogType);
  if (mechanismId === null) {
    return { mechanismId: null, role: null, challengeCeiling: null, playerIntent, effective: playerIntent };
  }

  const role = resolveNodeRole(architecture, nodeId, context);
  const affinity = resolveMechanismAffinity(challenge, mechanismId);
  const multiplier = roleMultiplier(affinity, role, challenge.workloadAffinity?.roleDefaults);
  const challengeCeiling = affinity.maxEffectiveness * multiplier;

  return { mechanismId, role, challengeCeiling, playerIntent, effective: challengeCeiling * playerIntent };
}

export interface ResolvedCacheHitRate extends CachePlacementEvidence {
  /** Dial intent after affinity ceiling; 0 when `coldCache` is true. */
  finalConfiguredHitRate: number;
}

/**
 * Shared cache hit-rate path for aggregate traffic, geographic traffic, and hot-key evaluation.
 * Cold-cache experiment overlay forces 0 as the final step — never before the affinity ceiling.
 */
export function resolveCacheConfiguredHitRate(input: {
  componentId: string;
  catalogType: "cdn" | "redis";
  playerIntent: number;
  architecture: Architecture;
  challenge: ChallengeDefinition;
  context?: RoleResolutionContext;
  coldCache?: boolean;
}): ResolvedCacheHitRate {
  const { role, mechanismId, challengeCeiling, playerIntent, effective } = effectiveEffectiveness({
    challenge: input.challenge,
    catalogType: input.catalogType,
    nodeId: input.componentId,
    architecture: input.architecture,
    playerIntent: input.playerIntent,
    context: input.context,
  });
  const effectiveConfiguredHitRate = effective;
  const finalConfiguredHitRate = input.coldCache ? 0 : effectiveConfiguredHitRate;
  return {
    role: role as ArchitecturalRoleId,
    mechanismId: mechanismId as WorkloadMechanismId,
    challengeCeiling: challengeCeiling as number,
    playerIntent,
    effectiveConfiguredHitRate,
    finalConfiguredHitRate,
  };
}

/**
 * Scales challenge viral redirect RPS by authored cache `reuseConcentration` when present.
 * Omitted affinity or omitted concentration preserves legacy viral load (factor 1.0).
 */
export function hotKeyViralRedirectRpsWithReuseConcentration(challenge: ChallengeDefinition, baseViralRedirectRps: number): number {
  if (baseViralRedirectRps <= 0) return 0;
  const affinity = challenge.workloadAffinity;
  if (!affinity) return baseViralRedirectRps;
  const dataConcentration = affinity.mechanisms.data_cache?.reuseConcentration;
  const edgeConcentration = affinity.mechanisms.edge_cache?.reuseConcentration;
  const concentration = dataConcentration ?? edgeConcentration ?? 1;
  return baseViralRedirectRps * concentration;
}

export type ParticipationState = "active" | "idle";

/** ACTIVE when the node handled simulator work this run; otherwise IDLE (base cost only, no usage pressure). */
export function resolveParticipationState(handledRps: number): ParticipationState {
  return handledRps > 0 ? "active" : "idle";
}

export interface MechanismPlacementEvidence {
  participation: ParticipationState;
  role: ArchitecturalRoleId;
  mechanismId: WorkloadMechanismId;
  challengeCeiling: number;
  playerIntent: number;
  effective: number;
  unitCostPressure: number;
  processingLatencyPenaltyMs: number;
}

export interface ResolveMechanismPlacementInput {
  challenge: ChallengeDefinition;
  catalogType: string;
  nodeId: string;
  architecture: Architecture;
  playerIntent: number;
  handledRps: number;
  context?: RoleResolutionContext;
}

/** Resolves placement evidence for non-cache mechanisms; returns null when the catalog type has no mechanism. */
export function resolveMechanismPlacement(input: ResolveMechanismPlacementInput): MechanismPlacementEvidence | null {
  const mechanismId = mechanismIdForCatalogType(input.catalogType);
  if (mechanismId === null) return null;

  const role = resolveNodeRole(input.architecture, input.nodeId, input.context);
  const affinity = resolveMechanismAffinity(input.challenge, mechanismId);
  const challengeCeiling = affinity.maxEffectiveness * roleMultiplier(affinity, role, input.challenge.workloadAffinity?.roleDefaults);
  const participation = resolveParticipationState(input.handledRps);
  const effective = participation === "active" ? challengeCeiling * input.playerIntent : 0;

  return {
    participation,
    role,
    mechanismId,
    challengeCeiling,
    playerIntent: input.playerIntent,
    effective,
    unitCostPressure: affinity.unitCostPressure ?? 1,
    processingLatencyPenaltyMs: affinity.processingLatencyPenaltyMs ?? 0,
  };
}

/** Counts healthy upstream Service targets on a load balancer's outgoing request edges. */
export function loadBalancerUpstreamServiceCount(architecture: Architecture, loadBalancerId: string): number {
  return architecture.connections.filter(
    (connection) =>
      connection.sourceComponentId === loadBalancerId &&
      connection.type === "request" &&
      architecture.components.find((component) => component.id === connection.targetComponentId)?.type === "service",
  ).length;
}

/**
 * Fan-out dial intent for request_fanout: one upstream ≈ no smoothing payoff; two or more unlocks benefit.
 * Returns 1.0 when there are two or more upstream services.
 */
export function loadBalancerFanOutPlayerIntent(architecture: Architecture, loadBalancerId: string): number {
  const upstreamCount = loadBalancerUpstreamServiceCount(architecture, loadBalancerId);
  if (upstreamCount <= 1) return 0;
  return 1;
}

/** ACTIVE-work capacity/absorb scale (1.0 when idle or legacy/no mechanism). */
export function activeCapacityScale(placement: MechanismPlacementEvidence | null): number {
  if (!placement || placement.participation !== "active") return 1;
  return placement.effective > 0 ? placement.effective : 1e-9;
}
