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

/** Shared visual states. `overloaded` remains as a compatibility alias for existing result mapping. */
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
  cacheHitFlash?: boolean;
  /** When set, cache cells at these indices fill (random order). Servers ignore this. */
  processingSlotIndices?: readonly number[];
  /** Catalog size/tier dial — drives chassis scale and internal density. */
  machineSize?: GlyphMachineSize;
}

/** Props derived from catalog state — visual dimensions and runtime state are applied by callers. */
export type CatalogGlyphProps = Omit<ComponentGlyphProps, "state" | "width" | "height" | "mini">;
