import type { GlyphType } from "./glyph-types";

export const GLYPH_SIZES: Record<GlyphType, { w: number; h: number }> = {
  user: { w: 56, h: 56 },
  cdn: { w: 80, h: 56 },
  dns: { w: 64, h: 56 },
  api_gateway: { w: 56, h: 72 },
  global_router: { w: 40, h: 72 },
  load_balancer: { w: 72, h: 64 },
  server: { w: 64, h: 72 },
  cache: { w: 64, h: 64 },
  sql_db: { w: 64, h: 80 },
  nosql_db: { w: 64, h: 80 },
  queue: { w: 96, h: 48 },
  pubsub: { w: 64, h: 64 },
  object_storage: { w: 64, h: 64 },
};

export const GLYPH_LABELS: Record<GlyphType, string> = {
  user: "User",
  cdn: "CDN",
  dns: "DNS",
  api_gateway: "API Gateway",
  global_router: "Global Router",
  load_balancer: "Load Balancer",
  server: "Server",
  cache: "Cache",
  sql_db: "SQL DB",
  nosql_db: "NoSQL DB",
  queue: "Queue",
  pubsub: "Pub/Sub",
  object_storage: "Object Storage",
};

export const MINI_GLYPH_SIZE = 24;
