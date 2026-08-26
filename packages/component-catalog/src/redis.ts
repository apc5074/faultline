import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export const redisModes = ["standalone", "replicated"] as const;
export type RedisMode = (typeof redisModes)[number];

export const redisTiers = ["small", "medium", "large"] as const;
export type RedisTier = (typeof redisTiers)[number];

export const redisTtlBands = ["short", "medium", "long"] as const;
export type RedisTtlBand = (typeof redisTtlBands)[number];

export interface RedisTierModel {
  /** Aggregate cache read throughput capacity. */
  throughputRps: number;
  /** Concentrated single-key capacity; replication raises this but does not shard the key. */
  hotKeyCapacityRps: number;
  monthlyCost: number;
}

/**
 * Educational Redis tiers. Values are Level 1 tuning constants, not cloud pricing.
 * The simulator applies hit-rate against eligible reads; this package owns the dials and models.
 */
export const redisTierModels: Readonly<Record<RedisTier, RedisTierModel>> = {
  small: { throughputRps: 20_000, hotKeyCapacityRps: 5_000, monthlyCost: 1_500 },
  medium: { throughputRps: 50_000, hotKeyCapacityRps: 12_000, monthlyCost: 3_000 },
  large: { throughputRps: 120_000, hotKeyCapacityRps: 30_000, monthlyCost: 6_000 },
};

/**
 * Deterministic educational hit-rate bands for eligible redirect reads.
 * Capacity saturation can still limit realized hits in the simulator.
 */
export const redisTtlHitRateBands: Readonly<Record<RedisTtlBand, number>> = {
  short: 0.55,
  medium: 0.75,
  long: 0.88,
};

/** Replicated mode increases capacity and cost; it does not cluster/shard hot keys. */
export const redisReplicatedMultipliers = {
  throughput: 1.8,
  hotKeyCapacity: 1.5,
  monthlyCost: 2,
} as const;

export interface RedisConfig extends JsonObject {
  mode: RedisMode;
  tier: RedisTier;
  ttlBand: RedisTtlBand;
}

function isRedisMode(value: unknown): value is RedisMode {
  return typeof value === "string" && (redisModes as readonly string[]).includes(value);
}

function isRedisTier(value: unknown): value is RedisTier {
  return typeof value === "string" && (redisTiers as readonly string[]).includes(value);
}

function isRedisTtlBand(value: unknown): value is RedisTtlBand {
  return typeof value === "string" && (redisTtlBands as readonly string[]).includes(value);
}

/** Effective capacity/cost after applying standalone vs replicated semantics. */
export function redisEffectiveModel(config: Pick<RedisConfig, "mode" | "tier">): RedisTierModel {
  const base = redisTierModels[config.tier];
  if (config.mode === "standalone") return { ...base };
  return {
    throughputRps: Math.round(base.throughputRps * redisReplicatedMultipliers.throughput),
    hotKeyCapacityRps: Math.round(base.hotKeyCapacityRps * redisReplicatedMultipliers.hotKeyCapacity),
    monthlyCost: base.monthlyCost * redisReplicatedMultipliers.monthlyCost,
  };
}

export function redisHitRateForConfig(config: Pick<RedisConfig, "ttlBand">): number {
  return redisTtlHitRateBands[config.ttlBand];
}

export function redisMonthlyCostForConfig(config: Pick<RedisConfig, "mode" | "tier">): number {
  return redisEffectiveModel(config).monthlyCost;
}

const redisConfigSchema: ComponentConfigSchema<RedisConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return {
        success: false,
        errors: ["Redis mode, tier, and ttlBand must be provided."],
      };
    }

    const record = input as Record<string, unknown>;
    if (!isRedisMode(record.mode)) {
      return { success: false, errors: ["Redis mode must be standalone or replicated."] };
    }
    if (!isRedisTier(record.tier)) {
      return { success: false, errors: ["Redis tier must be small, medium, or large."] };
    }
    if (!isRedisTtlBand(record.ttlBand)) {
      return { success: false, errors: ["Redis ttlBand must be short, medium, or long."] };
    }

    return { success: true, data: { mode: record.mode, tier: record.tier, ttlBand: record.ttlBand } };
  },
};

/**
 * Data-cache primitive placed on the Service → Postgres path.
 *
 * Ports stay on the existing `read_write` connection type so
 * Service → Redis → Postgres is a valid typed graph. Cache hits are applied
 * by the simulator; they are not a separate edge type.
 *
 * Replicated mode: one logical dataset with higher read/hot-path capacity
 * and higher cost. It is not clustering and does not split one hot key
 * across independent shards.
 *
 * Writes always continue to Postgres; Redis must not absorb write traffic.
 */
export const redisDefinition: ComponentDefinition<RedisConfig> = {
  type: "redis",
  label: "Redis",
  category: "Cache",
  defaultConfig: { mode: "standalone", tier: "medium", ttlBand: "medium" },
  configSchema: redisConfigSchema,
  ports: [
    {
      id: "cache_in",
      label: "Cache operations",
      direction: "input",
      connectionTypes: ["read_write"],
    },
    {
      id: "origin_out",
      label: "Origin / miss",
      direction: "output",
      connectionTypes: ["read_write"],
    },
  ],
  metrics: [
    { id: "hit_rate", label: "Hit rate", unit: "ratio" },
    { id: "read_throughput", label: "Read throughput", unit: "requests/sec" },
    { id: "miss_throughput", label: "Miss throughput", unit: "requests/sec" },
    { id: "utilization", label: "Utilization", unit: "ratio" },
    { id: "capacity", label: "Capacity", unit: "requests/sec" },
    { id: "hot_key_utilization", label: "Hot-key utilization", unit: "ratio" },
    { id: "reads_avoided", label: "Reads avoided at Postgres", unit: "requests/sec" },
  ],
  simulation: {
    role: "data_cache",
    cacheCapable: true,
    absorbsWrites: false,
    tierModels: redisTierModels as unknown as JsonObject,
    ttlHitRateBands: redisTtlHitRateBands as unknown as JsonObject,
    replicatedMultipliers: redisReplicatedMultipliers as unknown as JsonObject,
  },
  cost: {
    educationalEstimate: true,
    tierModels: redisTierModels as unknown as JsonObject,
    replicatedMultipliers: redisReplicatedMultipliers as unknown as JsonObject,
  },
  regionSupport: true,
  replicationSupport: true,
  clusteringSupport: false,
  agentCapabilities: [],
  schemaVersion: 1,
};
