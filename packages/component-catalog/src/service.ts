import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export const serviceInstanceBounds = { minimum: 1, maximum: 10 } as const;
export const serviceCapacityPerInstance = 2_000;
export const serviceMonthlyCostPerInstance = 1_000;

export interface ServiceConfig extends JsonObject {
  instances: number;
}

/** Shared capacity model used by the simulator and presentation adapters. */
export function serviceCapacityForInstances(instances: number): number {
  return instances * serviceCapacityPerInstance;
}

const serviceConfigSchema: ComponentConfigSchema<ServiceConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false, errors: ["Service instances must be an integer between 1 and 10."] };
    }

    const instances = (input as Record<string, unknown>).instances;
    if (
      typeof instances !== "number" ||
      !Number.isInteger(instances) ||
      instances < serviceInstanceBounds.minimum ||
      instances > serviceInstanceBounds.maximum
    ) {
      return {
        success: false,
        errors: [`Service instances must be an integer between ${serviceInstanceBounds.minimum} and ${serviceInstanceBounds.maximum}.`],
      };
    }

    return { success: true, data: { instances } };
  },
};

/** A fixed-capacity, player-configured compute primitive for the Tiny API slice. */
export const serviceDefinition: ComponentDefinition<ServiceConfig> = {
  type: "service",
  label: "Stateless Service",
  category: "Compute",
  defaultConfig: { instances: 1 },
  configSchema: serviceConfigSchema,
  ports: [
    {
      id: "request_in",
      label: "Requests",
      direction: "input",
      connectionTypes: ["request"],
    },
    {
      id: "database_out",
      label: "Database",
      direction: "output",
      connectionTypes: ["read_write"],
    },
  ],
  metrics: [
    { id: "incoming_requests_per_second", label: "Incoming requests/sec", unit: "requests/sec" },
    { id: "capacity", label: "Capacity", unit: "requests/sec" },
    { id: "utilization", label: "Utilization", unit: "percent" },
    { id: "headroom", label: "Headroom", unit: "requests/sec" },
    { id: "p95_latency", label: "p95 latency", unit: "milliseconds" },
  ],
  simulation: {
    capacityPerInstance: serviceCapacityPerInstance,
  },
  cost: {
    monthlyCostPerInstance: serviceMonthlyCostPerInstance,
  },
  regionSupport: false,
  replicationSupport: false,
  clusteringSupport: false,
  agentCapabilities: [],
  schemaVersion: 1,
};
