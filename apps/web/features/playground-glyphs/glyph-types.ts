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

export type GlyphState = "idle" | "selected" | "processing" | "overloaded" | "failed";

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
  replicas?: number;
  armAngle?: number;
  passCount?: number;
  processingCount?: number;
  cacheHitFlash?: boolean;
}

/** Props derived from catalog state — visual dimensions and runtime state are applied by callers. */
export type CatalogGlyphProps = Omit<ComponentGlyphProps, "state" | "width" | "height" | "mini">;
