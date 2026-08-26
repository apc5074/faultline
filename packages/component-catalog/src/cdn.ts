import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export const cdnTiers = ["small", "medium", "large"] as const;
export type CdnTier = (typeof cdnTiers)[number];

export const cdnTtlBands = ["short", "medium", "long"] as const;
export type CdnTtlBand = (typeof cdnTtlBands)[number];

export interface CdnTierModel {
  /** Edge throughput capacity for cacheable redirect traffic. */
  throughputRps: number;
  monthlyCost: number;
}

/**
 * Educational CDN tiers. Hit/miss application is SIM-007; this package owns dials and models.
 * Distinct from Redis: CDN reduces origin/application redirect RPS, not Postgres reads.
 */
export const cdnTierModels: Readonly<Record<CdnTier, CdnTierModel>> = {
  small: { throughputRps: 40_000, monthlyCost: 2_000 },
  medium: { throughputRps: 100_000, monthlyCost: 5_000 },
  large: { throughputRps: 250_000, monthlyCost: 12_000 },
};

/**
 * Deterministic educational hit-rate bands for eligible redirect traffic.
 * Documented beside Redis `ttlBand` with the same short/medium/long vocabulary.
 * SIM-007 applies these to coverage-eligible redirects only; writes always miss.
 */
export const cdnTtlHitRateBands: Readonly<Record<CdnTtlBand, number>> = {
  short: 0.55,
  medium: 0.75,
  long: 0.88,
};

export interface CdnConfig extends JsonObject {
  /** Fraction of redirect traffic logically eligible to be cached (0..1). Not geography. */
  coverage: number;
  ttlBand: CdnTtlBand;
  tier: CdnTier;
}

function isCdnTier(value: unknown): value is CdnTier {
  return typeof value === "string" && (cdnTiers as readonly string[]).includes(value);
}

function isCdnTtlBand(value: unknown): value is CdnTtlBand {
  return typeof value === "string" && (cdnTtlBands as readonly string[]).includes(value);
}

function isCoverage(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function cdnHitRateForConfig(config: Pick<CdnConfig, "ttlBand">): number {
  return cdnTtlHitRateBands[config.ttlBand];
}

export function cdnThroughputCapacityForConfig(config: Pick<CdnConfig, "tier">): number {
  return cdnTierModels[config.tier].throughputRps;
}

export function cdnMonthlyCostForConfig(config: Pick<CdnConfig, "tier">): number {
  return cdnTierModels[config.tier].monthlyCost;
}

/**
 * Effective configured hit intent before capacity saturation (SIM-007).
 * `coverage × ttl hit rate` — writes are never included.
 */
export function cdnConfiguredHitIntent(config: CdnConfig): number {
  return config.coverage * cdnHitRateForConfig(config);
}

const cdnConfigSchema: ComponentConfigSchema<CdnConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false, errors: ["CDN coverage, ttlBand, and tier must be provided."] };
    }

    const record = input as Record<string, unknown>;
    if (!isCoverage(record.coverage)) {
      return { success: false, errors: ["CDN coverage must be a number between 0 and 1."] };
    }
    if (!isCdnTtlBand(record.ttlBand)) {
      return { success: false, errors: ["CDN ttlBand must be short, medium, or long."] };
    }
    if (!isCdnTier(record.tier)) {
      return { success: false, errors: ["CDN tier must be small, medium, or large."] };
    }

    return {
      success: true,
      data: { coverage: record.coverage, ttlBand: record.ttlBand, tier: record.tier },
    };
  },
};

/**
 * Edge-cache primitive on the request path: Traffic → CDN → origin (Service).
 *
 * Phase 2 forwards all requests to origin until SIM-007 applies hit/miss offload.
 * Writes must never be reported as CDN hits. Geography/POPs are not modelled.
 */
export const cdnDefinition: ComponentDefinition<CdnConfig> = {
  type: "cdn",
  label: "CDN",
  category: "Cache",
  defaultConfig: { coverage: 0.8, ttlBand: "medium", tier: "medium" },
  configSchema: cdnConfigSchema,
  ports: [
    {
      id: "request_in",
      label: "Requests",
      direction: "input",
      connectionTypes: ["request"],
    },
    {
      id: "origin_out",
      label: "Origin",
      direction: "output",
      connectionTypes: ["request"],
    },
  ],
  metrics: [
    { id: "incoming_redirect_rps", label: "Incoming redirect requests/sec", unit: "requests/sec" },
    { id: "hit_rate", label: "Hit rate", unit: "ratio" },
    { id: "hit_rps", label: "Hit requests/sec", unit: "requests/sec" },
    { id: "miss_rps", label: "Miss requests/sec", unit: "requests/sec" },
    { id: "origin_rps", label: "Origin requests/sec", unit: "requests/sec" },
    { id: "utilization", label: "Utilization", unit: "ratio" },
    { id: "capacity", label: "Capacity", unit: "requests/sec" },
  ],
  simulation: {
    role: "edge_cache",
    cacheCapable: true,
    reducesOriginRedirects: true,
    absorbsWrites: false,
    forwardsRequests: true,
    geographicRouting: false,
    tierModels: cdnTierModels as unknown as JsonObject,
    ttlHitRateBands: cdnTtlHitRateBands as unknown as JsonObject,
  },
  cost: {
    educationalEstimate: true,
    tierModels: cdnTierModels as unknown as JsonObject,
  },
  regionSupport: false,
  replicationSupport: false,
  clusteringSupport: false,
  agentCapabilities: [],
  schemaVersion: 1,
};
