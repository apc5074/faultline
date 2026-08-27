/**
 * Deterministic nearest-healthy geographic routing helpers.
 * Logical connections still constrain candidates; geography only chooses among valid deployments.
 */

import {
  getRegion,
  isValidRegion,
  postgresPrimaryDeployment,
  postgresReplicaDeployments,
  serviceInstancesFromDeployment,
  type Architecture,
  type ComponentInstance,
  type RegionDeployment,
  type RegionId,
} from "@faultline/core";

import { getRegionLatencyMs } from "./region-latency.js";

export interface DeploymentCandidate {
  componentId: string;
  deployment: RegionDeployment;
  regionId: RegionId;
}

export interface GeographicRoute {
  originRegion: RegionId;
  destinationRegion: RegionId;
  componentId: string;
  deploymentId: string;
  rps: number;
  networkLatencyMs: number;
  kind: "request" | "read" | "write";
}

export interface RegionalComponentTraffic {
  incomingRps: number;
  readRps: number;
  writeRps: number;
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

/** True when the region registry marks the region healthy (Phase 3 defaults: all healthy). */
export function isHealthyRegion(regionId: string): boolean {
  if (!isValidRegion(regionId)) return false;
  return getRegion(regionId).health === "healthy";
}

export function architectureHasServiceDeployments(architecture: Architecture): boolean {
  return architecture.components.some((component) => component.type === "service" && component.deployments.length > 0);
}

/**
 * BFS along request edges through forwarders to find reachable Service components.
 * Respects the logical graph — geography never invents edges.
 */
export function findReachableServices(
  architecture: Architecture,
  startComponentIds: readonly string[],
  isForwarder: (component: ComponentInstance) => boolean,
): ComponentInstance[] {
  const byId = new Map(architecture.components.map((component) => [component.id, component]));
  const visited = new Set<string>();
  const pending = [...startComponentIds];
  const services: ComponentInstance[] = [];

  while (pending.length > 0) {
    const currentId = pending.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    const current = byId.get(currentId);
    if (!current) continue;

    if (current.type === "service") {
      services.push(current);
      continue;
    }

    if (current.type === "traffic-source" || isForwarder(current)) {
      for (const edge of requestEdgesFrom(architecture, current.id)) {
        if (!visited.has(edge.targetComponentId)) pending.push(edge.targetComponentId);
      }
    }
  }

  return stableById(services);
}

export function serviceDeploymentCandidates(services: readonly ComponentInstance[]): DeploymentCandidate[] {
  const candidates: DeploymentCandidate[] = [];
  for (const service of services) {
    for (const deployment of service.deployments) {
      if (!isValidRegion(deployment.regionId)) continue;
      if (serviceInstancesFromDeployment(deployment) === null) continue;
      candidates.push({
        componentId: service.id,
        deployment,
        regionId: deployment.regionId,
      });
    }
  }
  return candidates;
}

/**
 * Nearest healthy deployment by latency matrix, with stable tie-break on componentId then deploymentId.
 */
export function selectNearestHealthyDeployment(
  originRegionId: RegionId,
  candidates: readonly DeploymentCandidate[],
  excludedRegionIds: readonly string[] = [],
): DeploymentCandidate | null {
  const healthy = candidates.filter(
    (candidate) => isHealthyRegion(candidate.regionId) && !excludedRegionIds.includes(candidate.regionId),
  );
  if (healthy.length === 0) return null;

  const ranked = [...healthy].sort((left, right) => {
    const leftLatency = getRegionLatencyMs(originRegionId, left.regionId);
    const rightLatency = getRegionLatencyMs(originRegionId, right.regionId);
    if (leftLatency !== rightLatency) return leftLatency - rightLatency;
    const byComponent = left.componentId.localeCompare(right.componentId);
    if (byComponent !== 0) return byComponent;
    return left.deployment.id.localeCompare(right.deployment.id);
  });

  return ranked[0] ?? null;
}

export function redisDeploymentInRegion(
  redis: ComponentInstance,
  regionId: RegionId,
): RegionDeployment | undefined {
  return redis.deployments.find((deployment) => deployment.regionId === regionId);
}

/**
 * Prefer same-region Redis deployment when present; otherwise nearest healthy Redis deployment.
 * Returns null when Redis has no regional deployments (logical whole-component path).
 */
export function selectRedisDeploymentForServiceRegion(
  redis: ComponentInstance,
  serviceRegionId: RegionId,
  excludedRegionIds: readonly string[] = [],
): RegionDeployment | null {
  if (redis.deployments.length === 0) return null;
  const local = redisDeploymentInRegion(redis, serviceRegionId);
  if (local && isHealthyRegion(local.regionId) && !excludedRegionIds.includes(local.regionId)) return local;

  const candidates: DeploymentCandidate[] = redis.deployments
    .filter((deployment) => isValidRegion(deployment.regionId))
    .map((deployment) => ({
      componentId: redis.id,
      deployment,
      regionId: deployment.regionId as RegionId,
    }));
  return selectNearestHealthyDeployment(serviceRegionId, candidates, excludedRegionIds)?.deployment ?? null;
}

/**
 * Writes always target the Postgres primary deployment when geography is active.
 * Reads prefer a healthy same-region replica, else the primary.
 */
export function selectPostgresDeploymentForTraffic(
  postgres: ComponentInstance,
  serviceRegionId: RegionId,
  kind: "read" | "write",
  excludedRegionIds: readonly string[] = [],
): RegionDeployment | null {
  if (postgres.deployments.length === 0) return null;
  const primary = postgresPrimaryDeployment(postgres.deployments);
  if (!primary || !isValidRegion(primary.regionId)) return null;

  // A region failure never promotes a replica. Writes are unavailable while the
  // primary's region is excluded; this is deliberate experiment truth, not a
  // topology mutation.
  if (kind === "write") {
    return excludedRegionIds.includes(primary.regionId) ? null : primary;
  }

  const localReplica = postgresReplicaDeployments(postgres.deployments).find(
    (deployment) =>
      deployment.regionId === serviceRegionId &&
      isHealthyRegion(deployment.regionId) &&
      !excludedRegionIds.includes(deployment.regionId),
  );
  if (localReplica) return localReplica;
  return excludedRegionIds.includes(primary.regionId) ? null : primary;
}

export function addRegionalTraffic(
  store: Record<string, Record<string, RegionalComponentTraffic>>,
  componentId: string,
  regionId: string,
  delta: { incomingRps?: number; readRps?: number; writeRps?: number },
): void {
  if (!store[componentId]) store[componentId] = {};
  if (!store[componentId][regionId]) {
    store[componentId][regionId] = { incomingRps: 0, readRps: 0, writeRps: 0 };
  }
  const entry = store[componentId][regionId];
  entry.incomingRps += delta.incomingRps ?? 0;
  entry.readRps += delta.readRps ?? 0;
  entry.writeRps += delta.writeRps ?? 0;
}

export { requestEdgesFrom, databaseEdgesFrom };
