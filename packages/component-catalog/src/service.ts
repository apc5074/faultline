import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export const serviceInstanceBounds = { minimum: 1, maximum: 10 } as const;
export const serviceSizes = ["small", "medium", "large"] as const;
export type ServiceSize = (typeof serviceSizes)[number];

export interface ServiceSizeModel {
  capacityPerInstance: number;
  monthlyCostPerInstance: number;
}

/**
 * Educational service sizes. `medium` preserves the Phase 1 per-instance
 * capacity and cost so Tiny API configs remain playable unchanged.
 */
export const serviceSizeModels: Readonly<Record<ServiceSize, ServiceSizeModel>> = {
  small: { capacityPerInstance: 1_000, monthlyCostPerInstance: 500 },
  medium: { capacityPerInstance: 2_000, monthlyCostPerInstance: 1_000 },
  large: { capacityPerInstance: 4_000, monthlyCostPerInstance: 2_000 },
};

/** Phase 1 alias for medium capacity-per-instance. Prefer `serviceSizeModels`. */
export const serviceCapacityPerInstance = serviceSizeModels.medium.capacityPerInstance;
/** Phase 1 alias for medium monthly cost-per-instance. Prefer `serviceSizeModels`. */
export const serviceMonthlyCostPerInstance = serviceSizeModels.medium.monthlyCostPerInstance;

/** Educational base p95 before utilization pressure is applied. */
export const serviceBaseP95LatencyMs = 20;

export interface ServiceConfig extends JsonObject {
  size: ServiceSize;
  instances: number;
}

function isServiceSize(value: unknown): value is ServiceSize {
  return typeof value === "string" && (serviceSizes as readonly string[]).includes(value);
}

/** Shared capacity model used by the simulator and presentation adapters. */
export function serviceCapacityForConfig(config: Pick<ServiceConfig, "size" | "instances">): number {
  return config.instances * serviceSizeModels[config.size].capacityPerInstance;
}

/** Shared cost model used by the simulator and presentation adapters. */
export function serviceMonthlyCostForConfig(config: Pick<ServiceConfig, "size" | "instances">): number {
  return config.instances * serviceSizeModels[config.size].monthlyCostPerInstance;
}

/**
 * Capacity helper for callers that only know instance count.
 * Defaults to medium so Phase 1 call sites stay valid.
 */
export function serviceCapacityForInstances(instances: number, size: ServiceSize = "medium"): number {
  return serviceCapacityForConfig({ size, instances });
}

const serviceConfigSchema: ComponentConfigSchema<ServiceConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return {
        success: false,
        errors: ["Service size must be small, medium, or large and instances must be an integer between 1 and 10."],
      };
    }

    const record = input as Record<string, unknown>;
    const sizeInput = record.size;
    // Missing size defaults to medium so serialized Phase 1 architectures remain valid.
    const size = sizeInput === undefined ? "medium" : sizeInput;
    if (!isServiceSize(size)) {
      return { success: false, errors: ["Service size must be small, medium, or large."] };
    }

    const instances = record.instances;
    if (
      typeof instances !== "number" ||
      !Number.isInteger(instances) ||
      instances < serviceInstanceBounds.minimum ||
      instances > serviceInstanceBounds.maximum
    ) {
      return {
        success: false,
        errors: [
          `Service instances must be an integer between ${serviceInstanceBounds.minimum} and ${serviceInstanceBounds.maximum}.`,
        ],
      };
    }

    return { success: true, data: { size, instances } };
  },
};

/** A player-configured compute primitive with scale-up (size) and scale-out (instances). */
export const serviceDefinition: ComponentDefinition<ServiceConfig> = {
  type: "service",
  label: "Stateless Service",
  category: "Compute",
  defaultConfig: { size: "medium", instances: 1 },
  configSchema: serviceConfigSchema,
  ports: [
    {
      id: "request_in",
      label: "Requests",
      direction: "input",
      connectionTypes: ["request"],
    },
    {
      id: "object_in",
      label: "Object storage",
      direction: "input",
      connectionTypes: ["object_io"],
    },
    {
      id: "database_out",
      label: "Database",
      direction: "output",
      connectionTypes: ["read_write"],
    },
    {
      id: "object_out",
      label: "Object storage",
      direction: "output",
      connectionTypes: ["object_io"],
    },
    {
      id: "async_out",
      label: "Background work",
      direction: "output",
      connectionTypes: ["async_work"],
    },
  ],
  metrics: [
    { id: "incoming_requests_per_second", label: "Incoming requests/sec", unit: "requests/sec" },
    { id: "capacity", label: "Capacity", unit: "requests/sec" },
    { id: "utilization", label: "Utilization", unit: "percent" },
    { id: "headroom", label: "Headroom", unit: "requests/sec" },
    { id: "p95_latency", label: "p95 latency", unit: "milliseconds" },
  ],
  presentation: {
    glyph: "server",
    size: "standard",
    visualConfig: [
      { name: "instances", source: "config", path: "instances" },
      { name: "regionalInstances", source: "deployment", path: "config.instances" },
    ],
    supportedStates: ["idle", "processing", "warning", "critical", "saturated", "failed"],
  },
  simulation: {
    sizeModels: serviceSizeModels as unknown as JsonObject,
    baseP95LatencyMs: serviceBaseP95LatencyMs,
  },
  cost: {
    sizeModels: serviceSizeModels as unknown as JsonObject,
  },
  regionSupport: true,
  replicationSupport: false,
  clusteringSupport: false,
  agentCapabilities: [],
  schemaVersion: 1,
};
