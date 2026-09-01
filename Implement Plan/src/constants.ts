import type { ComponentType } from "./types";

export const COMPONENT_SIZES: Record<ComponentType, { w: number; h: number }> = {
  user: { w: 56, h: 56 },
  cdn: { w: 80, h: 56 },
  dns: { w: 64, h: 56 },
  api_gateway: { w: 56, h: 72 },
  load_balancer: { w: 72, h: 64 },
  server: { w: 64, h: 72 },
  cache: { w: 64, h: 64 },
  sql_db: { w: 64, h: 80 },
  nosql_db: { w: 64, h: 80 },
  queue: { w: 96, h: 48 },
  pubsub: { w: 64, h: 64 },
  object_storage: { w: 64, h: 64 },
};

export const COMPONENT_LABELS: Record<ComponentType, string> = {
  user: "User",
  cdn: "CDN",
  dns: "DNS",
  api_gateway: "API Gateway",
  load_balancer: "Load Balancer",
  server: "Server",
  cache: "Cache",
  sql_db: "SQL DB",
  nosql_db: "NoSQL DB",
  queue: "Queue",
  pubsub: "Pub/Sub",
  object_storage: "Object Storage",
};

export const COMPONENT_CATEGORIES: { label: string; items: ComponentType[] }[] = [
  { label: "Origin", items: ["user"] },
  { label: "Edge", items: ["cdn", "dns", "api_gateway"] },
  { label: "Routing", items: ["load_balancer"] },
  { label: "Compute", items: ["server"] },
  { label: "Storage", items: ["cache", "sql_db", "nosql_db", "object_storage"] },
  { label: "Messaging", items: ["queue", "pubsub"] },
];

export const DEFAULT_INSTANCES: Partial<Record<ComponentType, number>> = {
  server: 1,
};

export const DEFAULT_CAPACITY: Partial<Record<ComponentType, number>> = {
  cache: 16,
  queue: 8,
};

export const DEFAULT_REPLICAS: Partial<Record<ComponentType, number>> = {
  sql_db: 0,
};
