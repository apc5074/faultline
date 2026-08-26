/**
 * Educational cross-region network transfer cost.
 *
 * Driven by actual `geographicRoutes` (and derived replication from Postgres
 * deployments + write volume). Same-region hops are $0. Not cloud-provider pricing.
 *
 * CDN usage (Phase 2) prices edge request volume separately and is not re-charged here.
 */

import { secondsPerBillingMonth } from "@faultline/component-catalog";
import {
  getRegion,
  postgresPrimaryDeployment,
  postgresReplicaDeployments,
  type Architecture,
  type ChallengeDefinition,
  type CostLineItem,
  type TransferPayloadAssumptions,
} from "@faultline/core";

import type { GeographicRoute } from "./geographic-routing.js";

/** Decimal GB used for educational transfer billing (10^9 bytes). */
export const transferBytesPerGb = 1_000_000_000;

/** Same-region transfer is intentionally free in the educational model. */
export const sameRegionTransferUsdPerGb = 0;

/**
 * Simplified educational cross-region transfer rate ($/GB).
 * One flat class — not AWS/Azure/GCP region-pair pricing.
 */
export const crossRegionTransferUsdPerGb = 0.02;

/** Fallback payloads when a challenge omits `transferPayload` (e.g. Tiny API). */
export const defaultTransferPayloadAssumptions: TransferPayloadAssumptions = {
  redirectResponseBytes: 800,
  writeRequestBytes: 1_200,
  databaseReadBytes: 1_024,
  databaseWriteBytes: 512,
  replicationBytesPerWrite: 512,
};

export function resolveTransferPayload(
  challenge?: Pick<ChallengeDefinition, "transferPayload" | "workload">,
): TransferPayloadAssumptions {
  return challenge?.transferPayload ?? defaultTransferPayloadAssumptions;
}

function transferUsdPerGb(sourceRegion: string, targetRegion: string): number {
  return sourceRegion === targetRegion ? sameRegionTransferUsdPerGb : crossRegionTransferUsdPerGb;
}

/** Project sustained byte/sec into rounded monthly dollars. */
export function monthlyTransferCostUsd(bytesPerSecond: number, usdPerGb: number): number {
  if (bytesPerSecond <= 0 || usdPerGb <= 0) return 0;
  return Math.round((bytesPerSecond * secondsPerBillingMonth * usdPerGb) / transferBytesPerGb);
}

function bytesPerRequestRoute(
  challenge: Pick<ChallengeDefinition, "workload" | "transferPayload"> | undefined,
  payload: TransferPayloadAssumptions,
): number {
  const readRatio = challenge?.workload.readRatio ?? 1;
  const writeRatio = challenge?.workload.writeRatio ?? 0;
  return readRatio * payload.redirectResponseBytes + writeRatio * payload.writeRequestBytes;
}

function bytesForRoute(
  route: GeographicRoute,
  challenge: Pick<ChallengeDefinition, "workload" | "transferPayload"> | undefined,
  payload: TransferPayloadAssumptions,
): number {
  if (route.kind === "request") return bytesPerRequestRoute(challenge, payload);
  if (route.kind === "read") return payload.databaseReadBytes;
  return payload.databaseWriteBytes;
}

function regionPairLabel(sourceRegion: string, targetRegion: string): string {
  const source = getRegion(sourceRegion).label;
  const target = getRegion(targetRegion).label;
  return `${source} → ${target}`;
}

function stablePairKey(sourceRegion: string, targetRegion: string): string {
  return `${sourceRegion}->${targetRegion}`;
}

/**
 * Builds transfer + replication line items from simulated geographic routes.
 * Returns [] when routes are absent (architecture-only estimates stay component-priced).
 */
export function estimateCrossRegionTransferCost(input: {
  architecture: Architecture;
  challenge?: Pick<ChallengeDefinition, "workload" | "transferPayload">;
  geographicRoutes?: readonly GeographicRoute[];
}): readonly CostLineItem[] {
  const { architecture, challenge, geographicRoutes = [] } = input;
  if (geographicRoutes.length === 0) return [];

  const payload = resolveTransferPayload(challenge);
  const transferBytesByPair = new Map<string, { source: string; target: string; bytesPerSecond: number }>();

  for (const route of geographicRoutes) {
    const usdPerGb = transferUsdPerGb(route.originRegion, route.destinationRegion);
    if (usdPerGb <= 0) continue;

    const bytesPerSecond = route.rps * bytesForRoute(route, challenge, payload);
    if (bytesPerSecond <= 0) continue;

    const key = stablePairKey(route.originRegion, route.destinationRegion);
    const existing = transferBytesByPair.get(key);
    if (existing) {
      existing.bytesPerSecond += bytesPerSecond;
    } else {
      transferBytesByPair.set(key, {
        source: route.originRegion,
        target: route.destinationRegion,
        bytesPerSecond,
      });
    }
  }

  const lineItems: CostLineItem[] = [];

  for (const entry of [...transferBytesByPair.values()].sort((left, right) => {
    const bySource = left.source.localeCompare(right.source);
    return bySource !== 0 ? bySource : left.target.localeCompare(right.target);
  })) {
    const amount = monthlyTransferCostUsd(entry.bytesPerSecond, crossRegionTransferUsdPerGb);
    if (amount <= 0) continue;
    lineItems.push({
      componentId: `xfer:${stablePairKey(entry.source, entry.target)}`,
      amount,
      label: `Transfer · ${regionPairLabel(entry.source, entry.target)}`,
    });
  }

  // Replication: primary write volume × remote replica count (educational fan-out).
  const writeRpsByPostgres = new Map<string, number>();
  for (const route of geographicRoutes) {
    if (route.kind !== "write") continue;
    writeRpsByPostgres.set(route.componentId, (writeRpsByPostgres.get(route.componentId) ?? 0) + route.rps);
  }

  const replicationBytesByPair = new Map<string, { source: string; target: string; bytesPerSecond: number }>();

  for (const component of architecture.components) {
    if (component.type !== "postgres" || component.deployments.length === 0) continue;
    const primary = postgresPrimaryDeployment(component.deployments);
    if (!primary) continue;
    const writeRps = writeRpsByPostgres.get(component.id) ?? 0;
    if (writeRps <= 0) continue;

    for (const replica of postgresReplicaDeployments(component.deployments)) {
      if (replica.regionId === primary.regionId) continue;
      if (transferUsdPerGb(primary.regionId, replica.regionId) <= 0) continue;

      const bytesPerSecond = writeRps * payload.replicationBytesPerWrite;
      const key = stablePairKey(primary.regionId, replica.regionId);
      const existing = replicationBytesByPair.get(key);
      if (existing) {
        existing.bytesPerSecond += bytesPerSecond;
      } else {
        replicationBytesByPair.set(key, {
          source: primary.regionId,
          target: replica.regionId,
          bytesPerSecond,
        });
      }
    }
  }

  for (const entry of [...replicationBytesByPair.values()].sort((left, right) => {
    const bySource = left.source.localeCompare(right.source);
    return bySource !== 0 ? bySource : left.target.localeCompare(right.target);
  })) {
    const amount = monthlyTransferCostUsd(entry.bytesPerSecond, crossRegionTransferUsdPerGb);
    if (amount <= 0) continue;
    lineItems.push({
      componentId: `repl:${stablePairKey(entry.source, entry.target)}`,
      amount,
      label: `Replication · ${regionPairLabel(entry.source, entry.target)}`,
    });
  }

  return lineItems;
}
