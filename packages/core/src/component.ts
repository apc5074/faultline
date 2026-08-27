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

export const componentPresentationSizes = ["compact", "standard", "wide", "tall"] as const;
export type ComponentPresentationSize = (typeof componentPresentationSizes)[number];

export const componentPresentationStates = [
  "idle",
  "processing",
  "warning",
  "critical",
  "saturated",
  "failed",
] as const;
export type ComponentPresentationState = (typeof componentPresentationStates)[number];

export type ComponentPresentationBindingSource = "config" | "deployment";

/** A framework-neutral path from validated component metadata to static glyph props. */
export interface ComponentPresentationBinding {
  name: string;
  source: ComponentPresentationBindingSource;
  path: string;
}

/** Serializable metadata used by the web glyph registry to render a component. */
export interface ComponentPresentationDescriptor {
  glyph: string;
  size: ComponentPresentationSize;
  visualConfig: readonly ComponentPresentationBinding[];
  supportedStates: readonly ComponentPresentationState[];
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
  presentation: ComponentPresentationDescriptor;
  simulation?: JsonObject;
  cost?: JsonObject;
  regionSupport: boolean;
  replicationSupport: boolean;
  clusteringSupport: boolean;
  agentCapabilities: readonly string[];
  schemaVersion: number;
}
