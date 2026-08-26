import type { JsonObject, PortDefinition } from "./architecture.js";

export type ConfigValidationResult<TConfig extends JsonObject> =
  | { success: true; data: TConfig }
  | { success: false; errors: readonly string[] };

/** Runtime configuration boundary owned by each component definition. */
export interface ComponentConfigSchema<TConfig extends JsonObject = JsonObject> {
  safeParse(input: unknown): ConfigValidationResult<TConfig>;
}

export interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
}

/**
 * Framework-independent metadata describing one infrastructure primitive.
 * Its behavior/configuration is intentionally separate from challenge workload.
 */
export interface ComponentDefinition<TConfig extends JsonObject = JsonObject> {
  type: string;
  label: string;
  category: string;
  defaultConfig: TConfig;
  configSchema: ComponentConfigSchema<TConfig>;
  ports: readonly PortDefinition[];
  metrics: readonly MetricDefinition[];
  simulation?: JsonObject;
  cost?: JsonObject;
  regionSupport: boolean;
  replicationSupport: boolean;
  clusteringSupport: boolean;
  agentCapabilities: readonly string[];
  schemaVersion: number;
}
