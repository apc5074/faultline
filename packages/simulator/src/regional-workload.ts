/**
 * Derives explicit regional traffic origins from challenge geographic distribution.
 * UI must consume this result — it must not recalculate distribution math.
 *
 * Writes currently inherit the same origin fractions as redirects unless a challenge
 * later supplies a separate write distribution.
 */

import {
  isValidRegion,
  type ChallengeDefinition,
  type RegionId,
} from "@faultline/core";

export interface RegionalWorkloadOrigin {
  regionId: RegionId;
  fraction: number;
  redirectRps: number;
  writeRps: number;
  /** Regional share of viral/hot-key redirect traffic (compatible with Phase 2 hot-key). */
  hotKeyRedirectRps: number;
}

export interface RegionalWorkload {
  active: boolean;
  /**
   * Explicit assumption: write origins follow redirect geographicDistribution
   * until a challenge defines a separate write map.
   */
  writeDistributionMatchesRedirects: true;
  origins: readonly RegionalWorkloadOrigin[];
  totalRedirectRps: number;
  totalWriteRps: number;
  totalHotKeyRedirectRps: number;
}

const inactiveRegionalWorkload = (): RegionalWorkload => ({
  active: false,
  writeDistributionMatchesRedirects: true,
  origins: [],
  totalRedirectRps: 0,
  totalWriteRps: 0,
  totalHotKeyRedirectRps: 0,
});

/**
 * Splits challenge workload into per-region redirect, write, and hot-key redirect RPS.
 * Totals match global redirect/write demand; hot-key remains a fraction of redirects.
 */
export function deriveRegionalWorkload(challenge: ChallengeDefinition): RegionalWorkload {
  const distribution = challenge.geographicDistribution;
  if (!distribution || distribution.length === 0) {
    return inactiveRegionalWorkload();
  }

  const totalRedirectRps = challenge.workload.requestsPerSecond * challenge.workload.readRatio;
  const totalWriteRps = challenge.workload.requestsPerSecond * challenge.workload.writeRatio;
  const hotKeyFraction = challenge.workload.hotKeyReadFraction ?? 0;
  const totalHotKeyRedirectRps = totalRedirectRps * hotKeyFraction;

  const origins: RegionalWorkloadOrigin[] = distribution.map((share) => {
    if (!isValidRegion(share.regionId)) {
      throw new Error(`Unknown region "${share.regionId}" in geographic distribution.`);
    }
    const redirectRps = totalRedirectRps * share.fraction;
    const writeRps = totalWriteRps * share.fraction;
    return {
      regionId: share.regionId,
      fraction: share.fraction,
      redirectRps,
      writeRps,
      hotKeyRedirectRps: redirectRps * hotKeyFraction,
    };
  });

  return {
    active: true,
    writeDistributionMatchesRedirects: true,
    origins,
    totalRedirectRps,
    totalWriteRps,
    totalHotKeyRedirectRps,
  };
}
