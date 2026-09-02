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

export interface ComponentAgentConfigField {
  key: string;
  label: string;
  valueType: "number" | "string";
  unit?: string;
  minimum?: number;
  maximum?: number;
  options?: readonly string[];
  defaultValue: number | string;
}

/** Factual, challenge-neutral teaching metadata owned by the component catalog. */
export interface ComponentAgentFacts {
  configFields: readonly ComponentAgentConfigField[];
  costInputs: readonly string[];
  modeledBehaviors: readonly string[];
  unmodeledBehaviors: readonly string[];
  compatibleConnectionRoles: readonly string[];
  placementConstraints: readonly string[];
  learningThemes: readonly string[];
}

export type InterviewFailureScope = "component" | "region";
export type InterviewRecoveryEditClass = "scale_capacity" | "add_redundancy" | "reroute_traffic" | "remove_dependency";

/** Optional interview tuning owned by the component registration boundary. */
export interface ComponentInterviewProfile {
  readonly scale?: {
    readonly configPath: string;
    readonly safeValues: readonly (number | string)[];
    readonly earlyCareerEditCap: number;
  };
  readonly failure?: {
    readonly scopes: readonly InterviewFailureScope[];
    readonly recoveryEditClasses: readonly InterviewRecoveryEditClass[];
    readonly earlyCareerEditCap: number;
  };
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
  agentFacts?: ComponentAgentFacts;
  interview?: ComponentInterviewProfile;
  schemaVersion: number;
}
