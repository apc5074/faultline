import type { ComponentGlyphProps, GlyphType } from "./glyph-types.ts";

/** Stable, simulator-free props for visual regression snapshots of every glyph family. */
export const GLYPH_STATIC_FIXTURES: Readonly<Record<GlyphType, ComponentGlyphProps>> = {
  user: { type: "user", state: "idle" },
  cdn: { type: "cdn", state: "idle" },
  dns: { type: "dns", state: "idle", answerCount: 0 },
  api_gateway: { type: "api_gateway", state: "idle", rejectedCount: 0 },
  global_router: { type: "global_router", state: "idle" },
  load_balancer: { type: "load_balancer", state: "idle" },
  server: { type: "server", state: "idle", instances: 1 },
  cache: { type: "cache", state: "idle", capacity: 16 },
  sql_db: { type: "sql_db", state: "idle", replicas: 0 },
  nosql_db: { type: "nosql_db", state: "idle", documentSlots: 9 },
  queue: { type: "queue", state: "idle", slotCount: 8, queueDepth: 0 },
  pubsub: { type: "pubsub", state: "idle", fanOutCount: 6, deliveryCount: 0 },
  object_storage: { type: "object_storage", state: "idle", objectMarks: 0 },
};

