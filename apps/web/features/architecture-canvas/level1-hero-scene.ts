import type { Architecture, Connection } from "@faultline/core";

/**
 * Level 1 hero scene — Users → CDN → LB → 3 Services → Redis → Postgres.
 *
 * Two regions (us-east, europe) with regional deployments for cross-region playback.
 * Intended for motion QA and demo; not a prescribed winning topology.
 *
 * Playback demo checklist (manual QA):
 * 1. CDN hit / miss — medium TTL + 85% coverage shows edge hits and origin misses
 * 2. Load balancing across services — equal policy splits traffic across three services
 * 3. Redis hit / miss — long TTL band; miss path continues to Postgres
 * 4. Postgres query dwell — cache miss shows cylinder row lift / read dwell
 * 5. Server overload visual — service-a (small × 1) saturates under equal LB share
 * 6. Cross-region latency — europe service-c + replica reads use longer ink paths
 * 7. Component failure + failover reroute — delete service-a mid-playback; packets U-turn to b/c
 */
export function buildLevel1HeroScene(): Architecture {
  const components: Architecture["components"] = [
    {
      id: "hero-traffic",
      type: "traffic-source",
      config: { label: "Global users" },
      deployments: [],
      ui: { x: 20, y: 40 },
    },
    {
      id: "hero-cdn",
      type: "cdn",
      config: { coverage: 0.85, ttlBand: "medium", tier: "large" },
      deployments: [],
      ui: { x: 120, y: 40 },
    },
    {
      id: "hero-lb",
      type: "load-balancer",
      config: { policy: "equal" },
      deployments: [],
      ui: { x: 240, y: 40 },
    },
    {
      id: "hero-service-a",
      type: "service",
      config: { size: "small", instances: 1 },
      deployments: [{ id: "hero-svc-a-us-east", regionId: "us-east", config: { instances: 1 } }],
      ui: { x: 100, y: 140 },
    },
    {
      id: "hero-service-b",
      type: "service",
      config: { size: "medium", instances: 3 },
      deployments: [{ id: "hero-svc-b-us-east", regionId: "us-east", config: { instances: 3 } }],
      ui: { x: 100, y: 220 },
    },
    {
      id: "hero-service-c",
      type: "service",
      config: { size: "medium", instances: 3 },
      deployments: [{ id: "hero-svc-c-europe", regionId: "europe", config: { instances: 3 } }],
      ui: { x: 680, y: 200 },
    },
    {
      id: "hero-redis",
      type: "redis",
      config: { mode: "standalone", tier: "large", ttlBand: "long" },
      deployments: [
        { id: "hero-redis-us-east", regionId: "us-east", config: {} },
        { id: "hero-redis-europe", regionId: "europe", config: {} },
      ],
      ui: { x: 240, y: 260 },
    },
    {
      id: "hero-postgres",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 1 },
      deployments: [
        { id: "hero-pg-primary", regionId: "us-east", config: { role: "primary" } },
        { id: "hero-pg-europe", regionId: "europe", config: { role: "replica" } },
      ],
      ui: { x: 240, y: 140 },
    },
  ];

  const connections: Connection[] = [
    req("hero-traffic-cdn", "hero-traffic", "hero-cdn"),
    req("hero-cdn-lb", "hero-cdn", "hero-lb", "origin_out", "request_in"),
    req("hero-lb-a", "hero-lb", "hero-service-a"),
    req("hero-lb-b", "hero-lb", "hero-service-b"),
    req("hero-lb-c", "hero-lb", "hero-service-c"),
    db("hero-a-redis", "hero-service-a", "hero-redis", "database_out", "cache_in"),
    db("hero-b-redis", "hero-service-b", "hero-redis", "database_out", "cache_in"),
    db("hero-c-redis", "hero-service-c", "hero-redis", "database_out", "cache_in"),
    db("hero-redis-postgres", "hero-redis", "hero-postgres", "origin_out", "database_in"),
  ];

  return { version: 1, components, connections };
}

/** When true, the workspace loads the hero scene instead of the empty starter canvas. */
export function isLevel1HeroSceneEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_FAULTLINE_HERO_SCENE?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

function req(
  id: string,
  source: string,
  target: string,
  sourcePort = "request_out",
  targetPort = "request_in",
): Connection {
  return {
    id,
    sourceComponentId: source,
    sourcePortId: sourcePort,
    targetComponentId: target,
    targetPortId: targetPort,
    type: "request",
  };
}

function db(
  id: string,
  source: string,
  target: string,
  sourcePort: string,
  targetPort: string,
): Connection {
  return {
    id,
    sourceComponentId: source,
    sourcePortId: sourcePort,
    targetComponentId: target,
    targetPortId: targetPort,
    type: "read_write",
  };
}
