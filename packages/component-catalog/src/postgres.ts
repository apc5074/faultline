import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export const postgresTiers = ["small", "medium", "large"] as const;
export type PostgresTier = (typeof postgresTiers)[number];

export interface PostgresTierModel {
  readCapacityRps: number;
  writeCapacityRps: number;
  monthlyCost: number;
}

/** Simplified educational database tiers, not cloud-provider pricing. */
export const postgresTierModels: Readonly<Record<PostgresTier, PostgresTierModel>> = {
  small: { readCapacityRps: 5_000, writeCapacityRps: 800, monthlyCost: 2_000 },
  medium: { readCapacityRps: 10_000, writeCapacityRps: 2_000, monthlyCost: 4_000 },
  large: { readCapacityRps: 20_000, writeCapacityRps: 4_000, monthlyCost: 7_000 },
};

/** Educational base p95 before utilization pressure is applied. */
export const postgresBaseP95LatencyMs = 30;

export interface PostgresConfig extends JsonObject {
  tier: PostgresTier;
}

function isPostgresTier(value: unknown): value is PostgresTier {
  return typeof value === "string" && (postgresTiers as readonly string[]).includes(value);
}

const postgresConfigSchema: ComponentConfigSchema<PostgresConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false, errors: ["Postgres tier must be small, medium, or large."] };
    }

    const tier = (input as Record<string, unknown>).tier;
    if (!isPostgresTier(tier)) {
      return { success: false, errors: ["Postgres tier must be small, medium, or large."] };
    }

    return { success: true, data: { tier } };
  },
};

/**
 * Primary database primitive with independently modelled read and write limits.
 * Replicas, failover, and geography intentionally do not exist in Phase 1.
 */
export const postgresDefinition: ComponentDefinition<PostgresConfig> = {
  type: "postgres",
  label: "Postgres",
  category: "Database",
  defaultConfig: { tier: "small" },
  configSchema: postgresConfigSchema,
  ports: [
    {
      id: "database_in",
      label: "Database operations",
      direction: "input",
      connectionTypes: ["read_write"],
    },
  ],
  metrics: [
    { id: "read_requests_per_second", label: "Read requests/sec", unit: "requests/sec" },
    { id: "write_requests_per_second", label: "Write requests/sec", unit: "requests/sec" },
    { id: "read_capacity", label: "Read capacity", unit: "requests/sec" },
    { id: "write_capacity", label: "Write capacity", unit: "requests/sec" },
    { id: "read_utilization", label: "Read utilization", unit: "ratio" },
    { id: "write_utilization", label: "Write utilization", unit: "ratio" },
    { id: "effective_utilization", label: "Effective utilization", unit: "ratio" },
    { id: "read_capacity_shortfall", label: "Read capacity shortfall", unit: "requests/sec" },
    { id: "write_capacity_shortfall", label: "Write capacity shortfall", unit: "requests/sec" },
    { id: "p95_latency", label: "p95 latency", unit: "ms" },
  ],
  simulation: {
    baseP95LatencyMs: postgresBaseP95LatencyMs,
    readAndWriteCapacityAreIndependent: true,
  },
  cost: {
    educationalEstimate: true,
  },
  regionSupport: false,
  replicationSupport: false,
  clusteringSupport: false,
  agentCapabilities: [],
  schemaVersion: 1,
};
