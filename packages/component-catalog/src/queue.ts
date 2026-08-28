import type { ComponentConfigSchema, ComponentDefinition, JsonObject } from "@faultline/core";

export const queueCapacityTiers = ["small", "large"] as const;
export type QueueCapacityTier = (typeof queueCapacityTiers)[number];

export interface QueueCapacityModel {
  /** Maximum queued processing work represented by this queue. */
  capacityWorkUnits: number;
  /** Maximum work that can be accepted by the queue per second. */
  enqueueCapacityWorkUnitsPerSecond: number;
  /** Maximum work that can leave the queue per second, before Worker limits. */
  dequeueCapacityWorkUnitsPerSecond: number;
  /** Fixed educational monthly charge. */
  monthlyCost: number;
}

/** Educational bounded-buffer models, not provider pricing. */
export const queueCapacityModels: Readonly<Record<QueueCapacityTier, QueueCapacityModel>> = {
  small: {
    capacityWorkUnits: 120_000,
    enqueueCapacityWorkUnitsPerSecond: 8_000,
    dequeueCapacityWorkUnitsPerSecond: 8_000,
    monthlyCost: 2_000,
  },
  large: {
    capacityWorkUnits: 1_000_000,
    enqueueCapacityWorkUnitsPerSecond: 40_000,
    dequeueCapacityWorkUnitsPerSecond: 40_000,
    monthlyCost: 7_000,
  },
};

export interface QueueConfig extends JsonObject {
  capacityTier: QueueCapacityTier;
}

function isQueueCapacityTier(value: unknown): value is QueueCapacityTier {
  return typeof value === "string" && (queueCapacityTiers as readonly string[]).includes(value);
}

export function queueCapacityModelForConfig(config: Pick<QueueConfig, "capacityTier">): QueueCapacityModel {
  return queueCapacityModels[config.capacityTier];
}

export function queueCapacityWorkUnitsForConfig(config: Pick<QueueConfig, "capacityTier">): number {
  return queueCapacityModelForConfig(config).capacityWorkUnits;
}

export function queueMonthlyCostForConfig(config: Pick<QueueConfig, "capacityTier">): number {
  return queueCapacityModelForConfig(config).monthlyCost;
}

const queueConfigSchema: ComponentConfigSchema<QueueConfig> = {
  safeParse(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { success: false, errors: ["Queue capacityTier must be small or large."] };
    }

    const record = input as Record<string, unknown>;
    const capacityTier = record.capacityTier === undefined ? "small" : record.capacityTier;
    if (!isQueueCapacityTier(capacityTier)) {
      return { success: false, errors: ["Queue capacityTier must be small or large."] };
    }

    return { success: true, data: { capacityTier } };
  },
};

/**
 * Bounded asynchronous work buffer. Queue depth, age, overflow, and drain
 * behavior are simulator evidence; this catalog definition only owns the
 * player dial and its intrinsic limits/cost.
 */
export const queueDefinition: ComponentDefinition<QueueConfig> = {
  type: "queue",
  label: "Queue",
  category: "Async",
  defaultConfig: { capacityTier: "small" },
  configSchema: queueConfigSchema,
  ports: [
    {
      id: "queue_in",
      label: "Enqueue work",
      direction: "input",
      connectionTypes: ["async_work"],
    },
    {
      id: "queue_out",
      label: "Consume work",
      direction: "output",
      connectionTypes: ["async_work"],
    },
  ],
  metrics: [
    { id: "arrival_work_per_second", label: "Arrival work", unit: "work units/sec" },
    { id: "dequeue_work_per_second", label: "Dequeued work", unit: "work units/sec" },
    { id: "queue_depth", label: "Queue depth", unit: "work units" },
    { id: "queue_capacity", label: "Queue capacity", unit: "work units" },
    { id: "oldest_job_age", label: "Oldest job age", unit: "ms" },
    { id: "backlog_growth_rate", label: "Backlog growth", unit: "work units/sec" },
    { id: "overflow_work_per_second", label: "Overflow", unit: "work units/sec" },
    { id: "utilization", label: "Utilization", unit: "ratio" },
  ],
  presentation: {
    glyph: "queue",
    size: "standard",
    visualConfig: [{ name: "capacityTier", source: "config", path: "capacityTier" }],
    supportedStates: ["idle", "processing", "warning", "critical", "saturated", "failed"],
  },
  simulation: {
    role: "async_buffer",
    bounded: true,
    queueDepthIsSimulatorEvidence: true,
    capacityModels: queueCapacityModels as unknown as JsonObject,
  },
  cost: {
    educationalEstimate: true,
    capacityModels: queueCapacityModels as unknown as JsonObject,
  },
  regionSupport: false,
  replicationSupport: false,
  clusteringSupport: false,
  agentCapabilities: ["inspect_queue"],
  schemaVersion: 1,
};
