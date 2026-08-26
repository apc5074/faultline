/**
 * Deterministic educational network latency between regions.
 *
 * These are simplified educational latency assumptions, not real provider SLAs.
 * No live ping, jitter, time-of-day variation, or external latency APIs.
 */

import { isValidRegion, regionIds, UnknownRegionError, type RegionId } from "@faultline/core";

/** Same-region hop cost. Nonzero so local traffic still pays a small network tax. */
export const SAME_REGION_LATENCY_MS = 10;

/**
 * Complete symmetric six-region matrix (ms).
 * Source examples: us-east→europe ≈ 80, us-east→singapore ≈ 220, same-region = 10.
 */
const REGION_LATENCY_MS: Readonly<Record<RegionId, Readonly<Record<RegionId, number>>>> = {
  "us-east": {
    "us-east": SAME_REGION_LATENCY_MS,
    "us-west": 60,
    europe: 80,
    india: 180,
    singapore: 220,
    tokyo: 160,
  },
  "us-west": {
    "us-east": 60,
    "us-west": SAME_REGION_LATENCY_MS,
    europe: 140,
    india: 220,
    singapore: 180,
    tokyo: 110,
  },
  europe: {
    "us-east": 80,
    "us-west": 140,
    europe: SAME_REGION_LATENCY_MS,
    india: 120,
    singapore: 180,
    tokyo: 220,
  },
  india: {
    "us-east": 180,
    "us-west": 220,
    europe: 120,
    india: SAME_REGION_LATENCY_MS,
    singapore: 70,
    tokyo: 110,
  },
  singapore: {
    "us-east": 220,
    "us-west": 180,
    europe: 180,
    india: 70,
    singapore: SAME_REGION_LATENCY_MS,
    tokyo: 70,
  },
  tokyo: {
    "us-east": 160,
    "us-west": 110,
    europe: 220,
    india: 110,
    singapore: 70,
    tokyo: SAME_REGION_LATENCY_MS,
  },
};

function assertRegionId(id: string): RegionId {
  if (!isValidRegion(id)) {
    throw new UnknownRegionError(id);
  }
  return id;
}

/**
 * Educational one-way network latency between two registry regions.
 * @throws {UnknownRegionError} when either id is not in the region registry
 */
export function getRegionLatencyMs(sourceRegionId: string, targetRegionId: string): number {
  const source = assertRegionId(sourceRegionId);
  const target = assertRegionId(targetRegionId);
  const latencyMs = REGION_LATENCY_MS[source][target];
  if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs)) {
    throw new Error(`Missing latency matrix entry for ${source} → ${target}.`);
  }
  return latencyMs;
}

/** Exposes the full matrix for verification and future routing diagnostics. */
export function getRegionLatencyMatrix(): Readonly<Record<RegionId, Readonly<Record<RegionId, number>>>> {
  return REGION_LATENCY_MS;
}

/** Stable region order used when materializing the matrix. */
export function getLatencyMatrixRegionIds(): readonly RegionId[] {
  return regionIds;
}
