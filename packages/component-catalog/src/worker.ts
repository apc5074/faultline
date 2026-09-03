import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export const workerSizes = ["standard", "performance"] as const;
export type WorkerSize = (typeof workerSizes)[number];
export const workerInstanceBounds = { minimum: 1, maximum: 20 } as const;

export interface WorkerSizeModel {
  processingCapacityWorkUnitsPerSecond: number;
  sourceReadCapacityBytesPerSecond: number;
  outputWriteCapacityBytesPerSecond: number;
  monthlyCostPerInstance: number;
}

/** Educational background-processing models, not provider pricing. */
export const workerSizeModels: Readonly<Record<WorkerSize, WorkerSizeModel>> = {
  standard: {
    processingCapacityWorkUnitsPerSecond: 1_000,
    sourceReadCapacityBytesPerSecond: 500_000_000,
    outputWriteCapacityBytesPerSecond: 500_000_000,
    monthlyCostPerInstance: 1_500,
  },
  performance: {
    processingCapacityWorkUnitsPerSecond: 4_000,
    sourceReadCapacityBytesPerSecond: 2_000_000_000,
    outputWriteCapacityBytesPerSecond: 2_000_000_000,
    monthlyCostPerInstance: 4_500,
  },
};

export interface WorkerConfig extends JsonObject {
  size: WorkerSize;
  instances: number;
}

function isWorkerSize(value: unknown): value is WorkerSize {
  return typeof value === "string" && (workerSizes as readonly string[]).includes(value);
}

export function workerCapacityForConfig(config: Pick<WorkerConfig, "size" | "instances">): number {
  return config.instances * workerSizeModels[config.size].processingCapacityWorkUnitsPerSecond;
}

export function workerMonthlyCostForConfig(config: Pick<WorkerConfig, "size" | "instances">): number {
  return config.instances * workerSizeModels[config.size].monthlyCostPerInstance;
}

const workerConfigSchema: ComponentConfigSchema<WorkerConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false, errors: ["Worker size must be standard or performance and instances must be between 1 and 20."] };
    }
    const record = input as Record<string, unknown>;
    const size = record.size === undefined ? "standard" : record.size;
    const instances = record.instances;
    if (!isWorkerSize(size)) {
      return { success: false, errors: ["Worker size must be standard or performance."] };
    }
    if (
      typeof instances !== "number" ||
      !Number.isInteger(instances) ||
      instances < workerInstanceBounds.minimum ||
      instances > workerInstanceBounds.maximum
    ) {
      return { success: false, errors: [`Worker instances must be an integer between ${workerInstanceBounds.minimum} and ${workerInstanceBounds.maximum}.`] };
    }
    return { success: true, data: { size, instances } };
  },
};

/** Distinct asynchronous consumer; it is not synchronous Service capacity. */
export const workerDefinition: ComponentDefinition<WorkerConfig> = {
  type: "worker",
  label: "Worker",
  category: "Async",
  defaultConfig: { size: "standard", instances: 1 },
  configSchema: workerConfigSchema,
  ports: [
    { id: "queue_in", label: "Background work", direction: "input", connectionTypes: ["async_work"] },
    { id: "object_in", label: "Source objects", direction: "input", connectionTypes: ["object_io"] },
    { id: "object_out", label: "Processed objects", direction: "output", connectionTypes: ["object_io"] },
  ],
  metrics: [
    { id: "received_jobs_per_second", label: "Received jobs", unit: "jobs/sec" },
    { id: "completed_work_per_second", label: "Completed work", unit: "work units/sec" },
    { id: "processing_capacity", label: "Processing capacity", unit: "work units/sec" },
    { id: "processing_utilization", label: "Processing utilization", unit: "ratio" },
    { id: "active_work", label: "Active work", unit: "work units" },
    { id: "processing_delay", label: "Processing delay", unit: "ms" },
    { id: "unmet_work_per_second", label: "Unmet work", unit: "work units/sec" },
  ],
  presentation: {
    glyph: "server",
    size: "standard",
    visualConfig: [
      { name: "size", source: "config", path: "size" },
      { name: "instances", source: "config", path: "instances" },
    ],
    supportedStates: ["idle", "processing", "warning", "critical", "saturated", "failed"],
  },
  simulation: {
    role: "async_consumer",
    asynchronous: true,
    processingCapacityIsWorkUnitsPerSecond: true,
    sizeModels: workerSizeModels as unknown as JsonObject,
  },
  cost: { educationalEstimate: true, sizeModels: workerSizeModels as unknown as JsonObject },
  regionSupport: false,
  replicationSupport: false,
  clusteringSupport: false,
  agentCapabilities: ["inspect_processing"],
  schemaVersion: 1,
};
