import type { Architecture, Connection } from "@faultline/core";

/**
 * Level 1 reference answer (verified passer).
 *
 * Traffic → CDN → LB → Service A + Service B → Postgres
 *
 * CDN large + long TTL + full coverage offloads most redirects; two large
 * service pools (5+5 instances) clear miss/write capacity + 20% headroom;
 * Postgres large with one read replica clears store pressure under $85k.
 *
 * Used by the playground "Load (our) Answer" control.
 */
export function buildLevel1HeroScene(): Architecture {
  const components: Architecture["components"] = [
    {
      id: "hero-traffic",
      type: "traffic-source",
      config: { label: "Global users" },
      deployments: [],
      ui: { x: 40, y: 220 },
    },
    {
      id: "hero-cdn",
      type: "cdn",
      config: { coverage: 1, ttlBand: "long", tier: "large" },
      deployments: [],
      ui: { x: 200, y: 220 },
    },
    {
      id: "hero-lb",
      type: "load-balancer",
      config: { policy: "equal" },
      deployments: [],
      ui: { x: 360, y: 220 },
    },
    {
      id: "hero-service-a",
      type: "service",
      config: { size: "large", instances: 5 },
      deployments: [],
      ui: { x: 540, y: 140 },
    },
    {
      id: "hero-service-b",
      type: "service",
      config: { size: "large", instances: 5 },
      deployments: [],
      ui: { x: 540, y: 300 },
    },
    {
      id: "hero-postgres",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 1 },
      deployments: [],
      ui: { x: 740, y: 220 },
    },
  ];

  const connections: Connection[] = [
    req("hero-traffic-cdn", "hero-traffic", "hero-cdn"),
    req("hero-cdn-lb", "hero-cdn", "hero-lb", "origin_out", "request_in"),
    req("hero-lb-svc-a", "hero-lb", "hero-service-a"),
    req("hero-lb-svc-b", "hero-lb", "hero-service-b"),
    db("hero-svc-a-pg", "hero-service-a", "hero-postgres", "database_out", "database_in"),
    db("hero-svc-b-pg", "hero-service-b", "hero-postgres", "database_out", "database_in"),
  ];

  return { version: 1, components, connections };
}

/** When true, the workspace loads the hero scene instead of the Level Profile starter. */
export function isLevel1HeroSceneEnabled(): boolean {
  const flag =
    process.env.NEXT_PUBLIC_FAULTLINE_HERO_SCENE?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

/**
 * When true, show the playground "Load (our) Answer" control.
 * Set `NEXT_PUBLIC_FAULTLINE_LOAD_ANSWER=true` in local `.env` or Vercel env.
 */
export function isLevel1LoadAnswerEnabled(): boolean {
  const flag =
    process.env.NEXT_PUBLIC_FAULTLINE_LOAD_ANSWER?.trim().toLowerCase();
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
