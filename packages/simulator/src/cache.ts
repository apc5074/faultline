/**
 * Deterministic educational cache offload shared by CDN and Redis.
 * No randomness. Capacity caps realized hits; excess eligible traffic misses.
 */

export interface CacheOffloadInput {
  /** Traffic that may be served from cache (redirects/reads after eligibility filters). */
  eligibleRps: number;
  /** Configured hit rate on traffic the cache can actually serve (0..1). */
  configuredHitRate: number;
  /** Max cache throughput (lookups/hits the tier can sustain). */
  capacityRps: number;
}

export interface CacheResult {
  eligibleRps: number;
  /** Eligible traffic the cache could process given capacity. */
  servedEligibleRps: number;
  hitRps: number;
  missRps: number;
  /** Realized hits / eligible (0 when eligible is 0). */
  hitRate: number;
  capacityRps: number;
  utilization: number;
  saturated: boolean;
  /** Same as hitRps — downstream work avoided at the next layer. */
  downstreamAvoidedRps: number;
}

/**
 * Apply hit-rate to capacity-limited eligible traffic.
 *
 * servedEligible = min(eligible, capacity)
 * hits = servedEligible × configuredHitRate
 * misses = eligible − hits  (includes capacity overflow as misses)
 */
export function evaluateCacheOffload(input: CacheOffloadInput): CacheResult {
  const eligibleRps = Math.max(0, input.eligibleRps);
  const capacityRps = Math.max(0, input.capacityRps);
  const configuredHitRate = Math.min(1, Math.max(0, input.configuredHitRate));

  const servedEligibleRps = Math.min(eligibleRps, capacityRps);
  const hitRps = servedEligibleRps * configuredHitRate;
  const missRps = eligibleRps - hitRps;
  const utilization = capacityRps > 0 ? eligibleRps / capacityRps : eligibleRps > 0 ? Number.POSITIVE_INFINITY : 0;
  const saturated = eligibleRps > capacityRps;

  return {
    eligibleRps,
    servedEligibleRps,
    hitRps,
    missRps,
    hitRate: eligibleRps > 0 ? hitRps / eligibleRps : 0,
    capacityRps,
    utilization,
    saturated,
    downstreamAvoidedRps: hitRps,
  };
}
