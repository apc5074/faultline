export type GlyphType =
  | "user"
  | "cdn"
  | "dns"
  | "api_gateway"
  | "global_router"
  | "load_balancer"
  | "server"
  | "cache"
  | "sql_db"
  | "nosql_db"
  | "queue"
  | "pubsub"
  | "object_storage";

export type GlyphRenderType = GlyphType | "fallback";

/**
 * Shared visual states. The run story has three perceptible escalation states —
 * working (`processing`), straining (`warning`), failing (`saturated`/`failed`) —
 * plus `idle`/`selected`/`stale` chrome. `critical` and `overloaded` remain as
 * compatibility aliases for simulator band names and legacy callers; new
 * derivation code should not emit them.
 */
export type GlyphState =
  | "idle"
  | "selected"
  | "processing"
  | "warning"
  | "critical"
  | "saturated"
  | "overloaded"
  | "failed"
  | "stale";

/** Straining — the telegraph before failure (`component_warning` band). */
export function isStrainingGlyphState(state: GlyphState): boolean {
  return state === "warning" || state === "critical";
}

/** Failing — capacity exceeded or component down (`component_saturated` / failure injection). */
export function isFailingGlyphState(state: GlyphState): boolean {
  return state === "saturated" || state === "overloaded" || state === "failed";
}

export const GLYPH_STATES: readonly GlyphState[] = [
  "idle",
  "selected",
  "processing",
  "warning",
  "critical",
  "saturated",
  "overloaded",
  "failed",
  "stale",
];

export const GLYPH_TYPES: readonly GlyphType[] = [
  "user",
  "cdn",
  "dns",
  "api_gateway",
  "global_router",
  "load_balancer",
  "server",
  "cache",
  "sql_db",
  "nosql_db",
  "queue",
  "pubsub",
  "object_storage",
];

export type GlyphMachineSize = "small" | "medium" | "large";

export interface ComponentGlyphProps {
  type: GlyphRenderType;
  state: GlyphState;
  width?: number;
  height?: number;
  mini?: boolean;
  fallbackLabel?: string;
  instances?: number;
  capacity?: number;
  depth?: number;
  slotCount?: number;
  queueDepth?: number;
  replicas?: number;
  fanOutCount?: number;
  deliveryCount?: number;
  documentSlots?: number;
  objectMarks?: number;
  rejectedCount?: number;
  answerCount?: number;
  armAngle?: number;
  passCount?: number;
  processingCount?: number;
  /** Postgres's simulator-reported read and write pressure meters. */
  readProcessingCount?: number;
  writeProcessingCount?: number;
  cacheHitFlash?: boolean;
  /** When set, cache cells at these indices fill (random order). Servers ignore this. */
  processingSlotIndices?: readonly number[];
  /** Catalog size/tier dial — drives chassis scale and internal density. */
  machineSize?: GlyphMachineSize;
}

/** Props derived from catalog state — visual dimensions and runtime state are applied by callers. */
export type CatalogGlyphProps = Omit<ComponentGlyphProps, "state" | "width" | "height" | "mini">;
