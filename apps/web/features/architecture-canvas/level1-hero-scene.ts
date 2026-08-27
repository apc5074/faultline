import type { Architecture, Connection } from "@faultline/core";

/**
 * Level 1 reference answer — Users → CDN → Service → Postgres.
 *
 * CDN coverage 1 + long TTL offloads most redirects; large service scale and
 * large Postgres with two read replicas clear throughput, latency, headroom,
 * budget, and hot-key. Used by the playground "Load (our) Answer" control.
 */
export function buildLevel1HeroScene(): Architecture {
  const components: Architecture["components"] = [
    {
      id: "hero-traffic",
      type: "traffic-source",
      config: { label: "Global users" },
      deployments: [],
      ui: { x: 40, y: 120 },
    },
    {
      id: "hero-cdn",
      type: "cdn",
      config: { coverage: 1, ttlBand: "long", tier: "large" },
      deployments: [],
      ui: { x: 200, y: 120 },
    },
    {
      id: "hero-service",
      type: "service",
      config: { size: "large", instances: 6 },
      deployments: [],
      ui: { x: 380, y: 120 },
    },
    {
      id: "hero-postgres",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 2 },
      deployments: [],
      ui: { x: 560, y: 120 },
    },
  ];

  const connections: Connection[] = [
    req("hero-traffic-cdn", "hero-traffic", "hero-cdn"),
    req("hero-cdn-service", "hero-cdn", "hero-service", "origin_out", "request_in"),
    db("hero-service-postgres", "hero-service", "hero-postgres", "database_out", "database_in"),
  ];

  return { version: 1, components, connections };
}

/** When true, the workspace loads the hero scene instead of the empty starter canvas. */
export function isLevel1HeroSceneEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_FAULTLINE_HERO_SCENE?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

/**
 * When true, show the playground "Load (our) Answer" control.
 * Set `NEXT_PUBLIC_FAULTLINE_LOAD_ANSWER=true` in local `.env` or Vercel env.
 */
export function isLevel1LoadAnswerEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_FAULTLINE_LOAD_ANSWER?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
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
