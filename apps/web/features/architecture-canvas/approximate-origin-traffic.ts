/**
 * Ballpark challenge origin demand for Traffic Source inspector.
 * Intentionally coarse (rounded shares / RPS) — not simulator truth.
 */

import { getRegion, type GeographicTrafficShare, type RegionId } from "@faultline/core";

export type ApproximateOriginShare = {
  regionId: RegionId;
  label: string;
  /** Share rounded to nearest 5 percentage points. */
  sharePct: number;
  /** Rough sustained RPS for this origin (nearest thousand). */
  approxRps: number;
  /** Normalized bar width from rounded shares (sums to ~1). */
  barWeight: number;
};

function roundSharePct(fraction: number): number {
  if (fraction <= 0) return 0;
  return Math.max(5, Math.round(fraction * 20) * 5);
}

function roundApproxRps(rps: number): number {
  if (rps <= 0) return 0;
  if (rps < 1500) return Math.round(rps / 100) * 100;
  return Math.round(rps / 1000) * 1000;
}

/** Compact label like "~30k/s" for inspector rows. */
export function formatApproxRps(rps: number): string {
  if (rps <= 0) return "~0/s";
  if (rps >= 1000) {
    const thousands = rps / 1000;
    const rounded = Math.round(thousands * 10) / 10;
    const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `~${label}k/s`;
  }
  return `~${rps}/s`;
}

/**
 * Build approximate per-origin demand from challenge geography + total RPS.
 * Does not re-run the simulator and must not be used for scoring.
 */
export function approximateOriginTraffic(input: {
  geographicDistribution: readonly GeographicTrafficShare[] | undefined;
  totalRequestsPerSecond: number;
}): ApproximateOriginShare[] {
  const distribution = input.geographicDistribution ?? [];
  if (distribution.length === 0 || input.totalRequestsPerSecond <= 0) return [];

  const rows = distribution.map((share) => {
    const sharePct = roundSharePct(share.fraction);
    const approxRps = roundApproxRps(input.totalRequestsPerSecond * share.fraction);
    return {
      regionId: share.regionId as RegionId,
      label: getRegion(share.regionId).label,
      sharePct,
      approxRps,
      barWeight: 0,
    };
  });

  const weightSum = rows.reduce((sum, row) => sum + row.sharePct, 0);
  return rows.map((row) => ({
    ...row,
    barWeight: weightSum > 0 ? row.sharePct / weightSum : 0,
  }));
}
