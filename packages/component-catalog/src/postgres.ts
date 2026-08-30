import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export const postgresTiers = ["small", "medium", "large"] as const;
export type PostgresTier = (typeof postgresTiers)[number];

export const postgresReadReplicaBounds = { minimum: 0, maximum: 8 } as const;

export interface PostgresTierModel {
  readCapacityRps: number;
  writeCapacityRps: number;
  /** Per logical read replica; defaults to primary read capacity when omitted. */
  replicaReadCapacityRps: number;
  monthlyCost: number;
  /** Educational monthly cost per logical read replica (COST-003 consumes this). */
  monthlyCostPerReplica: number;
}

/** Simplified educational database tiers, not cloud-provider pricing. */
export const postgresTierModels: Readonly<Record<PostgresTier, PostgresTierModel>> = {
  small: {
    readCapacityRps: 5_000,
    writeCapacityRps: 800,
    replicaReadCapacityRps: 5_000,
    monthlyCost: 2_000,
    monthlyCostPerReplica: 1_500,
  },
  medium: {
    readCapacityRps: 10_000,
    writeCapacityRps: 2_000,
    replicaReadCapacityRps: 10_000,
    monthlyCost: 4_000,
    monthlyCostPerReplica: 3_000,
  },
  large: {
    readCapacityRps: 20_000,
    writeCapacityRps: 5_000,
    replicaReadCapacityRps: 20_000,
    monthlyCost: 7_000,
    monthlyCostPerReplica: 5_000,
  },
};

/** Educational base p95 before utilization pressure is applied. */
export const postgresBaseP95LatencyMs = 30;

export interface PostgresConfig extends JsonObject {
  tier: PostgresTier;
  /** Logical read replica count. Phase 3 may replace count with region-assigned replica entries. */
  readReplicaCount: number;
}

function isPostgresTier(value: unknown): value is PostgresTier {
  return typeof value === "string" && (postgresTiers as readonly string[]).includes(value);
}

export function postgresPrimaryReadCapacity(config: Pick<PostgresConfig, "tier">): number {
  return postgresTierModels[config.tier].readCapacityRps;
}

export function postgresWriteCapacityForConfig(config: Pick<PostgresConfig, "tier">): number {
  return postgresTierModels[config.tier].writeCapacityRps;
}

export function postgresReplicaReadCapacityEach(config: Pick<PostgresConfig, "tier">): number {
  return postgresTierModels[config.tier].replicaReadCapacityRps;
}

/** Aggregate read capacity = primary + replicas. Writes remain primary-only. */
export function postgresReadCapacityForConfig(config: Pick<PostgresConfig, "tier" | "readReplicaCount">): number {
  const model = postgresTierModels[config.tier];
  return model.readCapacityRps + config.readReplicaCount * model.replicaReadCapacityRps;
}

/** Educational monthly cost: primary tier + per-replica add-on. */
export function postgresMonthlyCostForConfig(config: Pick<PostgresConfig, "tier" | "readReplicaCount">): number {
  const model = postgresTierModels[config.tier];
  return model.monthlyCost + config.readReplicaCount * model.monthlyCostPerReplica;
}

/**
 * Capacity-proportional read split across primary + logical replicas.
 * Writes are not distributed — callers keep them on primary only.
 */
export function distributePostgresReads(
  readRps: number,
  config: Pick<PostgresConfig, "tier" | "readReplicaCount">,
): { primaryReadRps: number; replicaReadRps: number } {
  const primaryCapacity = postgresPrimaryReadCapacity(config);
  const replicaCapacityEach = postgresReplicaReadCapacityEach(config);
  const totalCapacity = primaryCapacity + config.readReplicaCount * replicaCapacityEach;
  if (readRps <= 0 || totalCapacity <= 0) {
    return { primaryReadRps: 0, replicaReadRps: 0 };
  }
  const primaryReadRps = (readRps * primaryCapacity) / totalCapacity;
  return {
    primaryReadRps,
    replicaReadRps: readRps - primaryReadRps,
  };
}

const postgresConfigSchema: ComponentConfigSchema<PostgresConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false, errors: ["Postgres tier must be small, medium, or large."] };
    }

    const record = input as Record<string, unknown>;
    const tier = record.tier;
    if (!isPostgresTier(tier)) {
      return { success: false, errors: ["Postgres tier must be small, medium, or large."] };
    }

    const replicaInput = record.readReplicaCount;
    // Missing count defaults to 0 so Phase 1 architectures remain valid.
    const readReplicaCount = replicaInput === undefined ? 0 : replicaInput;
    if (
      typeof readReplicaCount !== "number" ||
      !Number.isInteger(readReplicaCount) ||
      readReplicaCount < postgresReadReplicaBounds.minimum ||
      readReplicaCount > postgresReadReplicaBounds.maximum
    ) {
      return {
        success: false,
        errors: [
          `Postgres readReplicaCount must be an integer between ${postgresReadReplicaBounds.minimum} and ${postgresReadReplicaBounds.maximum}.`,
        ],
      };
    }

    return { success: true, data: { tier, readReplicaCount } };
  },
};

/**
 * Primary database primitive with independently modelled read and write limits.
 * Logical read replicas increase read capacity only; writes always hit primary.
 * Phase 3 may assign regions to replicas without replacing this component type.
 */
export const postgresDefinition: ComponentDefinition<PostgresConfig> = {
  type: "postgres",
  label: "Postgres",
  category: "Database",
  defaultConfig: { tier: "small", readReplicaCount: 0 },
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
    { id: "read_replica_count", label: "Read replica count", unit: "count" },
    { id: "p95_latency", label: "p95 latency", unit: "ms" },
  ],
  presentation: {
    glyph: "sql_db",
    size: "standard",
    visualConfig: [
      { name: "tier", source: "config", path: "tier" },
      { name: "readReplicaCount", source: "config", path: "readReplicaCount" },
      { name: "deploymentRoles", source: "deployment", path: "config.role" },
    ],
    supportedStates: ["idle", "processing", "warning", "critical", "saturated", "failed"],
  },
  simulation: {
    baseP95LatencyMs: postgresBaseP95LatencyMs,
    readAndWriteCapacityAreIndependent: true,
    writesTargetPrimaryOnly: true,
    readReplicaExtensionPoint:
      "Regional deployments assign primary and replica regions on the same postgres component; readReplicaCount must match replica deployment count when geography is active.",
  },
  cost: {
    educationalEstimate: true,
    tierModels: postgresTierModels as unknown as JsonObject,
  },
  regionSupport: true,
  replicationSupport: true,
  clusteringSupport: false,
  agentCapabilities: [],
  agentFacts: {
    configFields: [
      { key: "tier", label: "Tier", valueType: "string", options: [...postgresTiers], defaultValue: "small" },
      { key: "readReplicaCount", label: "Read replicas", valueType: "number", unit: "replicas", minimum: 0, maximum: 8, defaultValue: 0 },
    ],
    costInputs: ["tier", "readReplicaCount"], modeledBehaviors: ["primary reads and writes", "read replica capacity", "write-primary routing"],
    unmodeledBehaviors: ["transactions", "schema/index design", "replication lag"], compatibleConnectionRoles: ["read_write"],
    placementConstraints: ["Writes remain on the primary; replicas add read capacity."], learningThemes: ["read/write separation", "replica capacity", "durable storage"],
  },
  schemaVersion: 1,
};
