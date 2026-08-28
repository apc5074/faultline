import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export const objectStorageTiers = ["standard", "high-throughput"] as const;
export type ObjectStorageTier = (typeof objectStorageTiers)[number];

export interface ObjectStorageTierModel {
  /** Educational sustained upload/write capacity in bytes per second. */
  uploadCapacityBytesPerSecond: number;
  /** Educational sustained origin-read capacity in bytes per second. */
  originReadCapacityBytesPerSecond: number;
  /** Fixed monthly infrastructure charge, excluding stored bytes and usage. */
  monthlyBaseCost: number;
  /** Educational storage charge per GB-month. */
  storageCostPerGbMonth: number;
  /** Educational request charge per million object operations. */
  requestCostPerMillion: number;
  /** Educational origin transfer charge per GB. */
  originTransferCostPerGb: number;
}

/** Educational object-storage models, not provider pricing. */
export const objectStorageTierModels: Readonly<Record<ObjectStorageTier, ObjectStorageTierModel>> = {
  standard: {
    uploadCapacityBytesPerSecond: 2_000_000_000,
    originReadCapacityBytesPerSecond: 2_000_000_000,
    monthlyBaseCost: 2_500,
    storageCostPerGbMonth: 0.02,
    requestCostPerMillion: 0.02,
    originTransferCostPerGb: 0.02,
  },
  "high-throughput": {
    uploadCapacityBytesPerSecond: 10_000_000_000,
    originReadCapacityBytesPerSecond: 10_000_000_000,
    monthlyBaseCost: 8_000,
    storageCostPerGbMonth: 0.04,
    requestCostPerMillion: 0.03,
    originTransferCostPerGb: 0.02,
  },
};

export interface ObjectStorageConfig extends JsonObject {
  tier: ObjectStorageTier;
}

function isObjectStorageTier(value: unknown): value is ObjectStorageTier {
  return typeof value === "string" && (objectStorageTiers as readonly string[]).includes(value);
}

export function objectStorageModelForConfig(config: Pick<ObjectStorageConfig, "tier">): ObjectStorageTierModel {
  return objectStorageTierModels[config.tier];
}

/** Fixed educational cost before workload-dependent storage, request, and transfer charges. */
export function objectStorageMonthlyBaseCostForConfig(config: Pick<ObjectStorageConfig, "tier">): number {
  return objectStorageModelForConfig(config).monthlyBaseCost;
}

const objectStorageConfigSchema: ComponentConfigSchema<ObjectStorageConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false, errors: ["Object Storage tier must be standard or high-throughput."] };
    }

    const record = input as Record<string, unknown>;
    const tier = record.tier === undefined ? "standard" : record.tier;
    if (!isObjectStorageTier(tier)) {
      return { success: false, errors: ["Object Storage tier must be standard or high-throughput."] };
    }

    return { success: true, data: { tier } };
  },
};

/**
 * Durable large-object storage. The simulator later distinguishes upload
 * writes from Worker output writes and CDN-miss origin reads; the catalog does
 * not infer either workload from the graph.
 */
export const objectStorageDefinition: ComponentDefinition<ObjectStorageConfig> = {
  type: "object-storage",
  label: "Object Storage",
  category: "Storage",
  defaultConfig: { tier: "standard" },
  configSchema: objectStorageConfigSchema,
  ports: [
    {
      id: "object_in",
      label: "Object operations",
      direction: "input",
      connectionTypes: ["object_io"],
    },
    {
      id: "object_out",
      label: "Object reads",
      direction: "output",
      connectionTypes: ["object_io"],
    },
  ],
  metrics: [
    { id: "upload_throughput", label: "Upload throughput", unit: "bytes/sec" },
    { id: "upload_capacity", label: "Upload capacity", unit: "bytes/sec" },
    { id: "origin_read_throughput", label: "Origin read throughput", unit: "bytes/sec" },
    { id: "origin_read_capacity", label: "Origin read capacity", unit: "bytes/sec" },
    { id: "upload_utilization", label: "Upload utilization", unit: "ratio" },
    { id: "origin_read_utilization", label: "Origin read utilization", unit: "ratio" },
    { id: "stored_bytes", label: "Stored data", unit: "bytes" },
    { id: "rejected_or_unmet_io", label: "Rejected or unmet I/O", unit: "bytes/sec" },
    { id: "p95_latency", label: "p95 latency", unit: "ms" },
  ],
  presentation: {
    glyph: "object_storage",
    size: "standard",
    visualConfig: [{ name: "tier", source: "config", path: "tier" }],
    supportedStates: ["idle", "processing", "warning", "critical", "saturated", "failed"],
  },
  simulation: {
    role: "object_store",
    storesLargeObjects: true,
    separatesUploadWritesAndOriginReads: true,
    tierModels: objectStorageTierModels as unknown as JsonObject,
  },
  cost: {
    educationalEstimate: true,
    tierModels: objectStorageTierModels as unknown as JsonObject,
  },
  regionSupport: false,
  replicationSupport: false,
  clusteringSupport: false,
  agentCapabilities: [],
  schemaVersion: 1,
};
