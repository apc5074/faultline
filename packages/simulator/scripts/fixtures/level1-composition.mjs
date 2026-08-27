import { urlShortenerChallenge } from "@faultline/challenges";

/**
 * Shared Level 1 integration fixtures. They intentionally contain only
 * canonical Architecture data so verifiers exercise validation and traffic
 * propagation exactly as product callers do.
 */
export const level1CompositionChallenge = {
  ...urlShortenerChallenge,
  allowedComponentTypes: [
    ...new Set([
      ...urlShortenerChallenge.allowedComponentTypes,
      "cdn",
      "global-router",
      "load-balancer",
      "redis",
    ]),
  ],
};

const ui = (x, y = 0) => ({ x, y });

const connection = (id, sourceComponentId, sourcePortId, targetComponentId, targetPortId, type) => ({
  id,
  sourceComponentId,
  sourcePortId,
  targetComponentId,
  targetPortId,
  type,
});

export function createDirectServiceArchitecture() {
  return {
    version: 1,
    components: [
      { id: "traffic", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: ui(0) },
      { id: "service", type: "service", config: { size: "large", instances: 8 }, deployments: [], ui: ui(1) },
      { id: "postgres", type: "postgres", config: { tier: "large", readReplicaCount: 0 }, deployments: [], ui: ui(2) },
    ],
    connections: [
      connection("traffic-service", "traffic", "request_out", "service", "request_in", "request"),
      connection("service-postgres", "service", "database_out", "postgres", "database_in", "read_write"),
    ],
  };
}

export function createCdnServiceArchitecture() {
  const direct = createDirectServiceArchitecture();
  return {
    ...direct,
    components: [
      direct.components[0],
      { id: "cdn", type: "cdn", config: { coverage: 1, ttlBand: "long", tier: "large" }, deployments: [], ui: ui(1) },
      { ...direct.components[1], ui: ui(2) },
      { ...direct.components[2], ui: ui(3) },
    ],
    connections: [
      connection("traffic-cdn", "traffic", "request_out", "cdn", "request_in", "request"),
      connection("cdn-service", "cdn", "origin_out", "service", "request_in", "request"),
      direct.connections[1],
    ],
  };
}

export function createLogicalFanoutArchitecture(policy = "equal") {
  return {
    version: 1,
    components: [
      { id: "traffic", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: ui(0) },
      { id: "router", type: "global-router", config: {}, deployments: [], ui: ui(1) },
      { id: "lb", type: "load-balancer", config: { policy }, deployments: [], ui: ui(2) },
      { id: "service-small", type: "service", config: { size: "large", instances: 2 }, deployments: [], ui: ui(3, -1) },
      { id: "service-large", type: "service", config: { size: "large", instances: 6 }, deployments: [], ui: ui(3, 1) },
      { id: "postgres", type: "postgres", config: { tier: "large", readReplicaCount: 0 }, deployments: [], ui: ui(4) },
    ],
    connections: [
      connection("traffic-router", "traffic", "request_out", "router", "request_in", "request"),
      connection("router-lb", "router", "route_out", "lb", "request_in", "request"),
      connection("lb-service-small", "lb", "request_out", "service-small", "request_in", "request"),
      connection("lb-service-large", "lb", "request_out", "service-large", "request_in", "request"),
      connection("service-small-postgres", "service-small", "database_out", "postgres", "database_in", "read_write"),
      connection("service-large-postgres", "service-large", "database_out", "postgres", "database_in", "read_write"),
    ],
  };
}

/**
 * The productive seven-component path. With regional=true this exercises geo
 * activation; otherwise it is deliberately the same logical graph.
 */
export function createSevenComponentArchitecture({ regional = false, includeIdleRedis = false } = {}) {
  const serviceDeployments = regional
    ? [
        { id: "service-us-east", regionId: "us-east", config: { instances: 4 } },
        { id: "service-europe", regionId: "europe", config: { instances: 4 } },
      ]
    : [];
  const redisDeployments = regional
    ? [
        { id: "redis-us-east", regionId: "us-east", config: {} },
        { id: "redis-europe", regionId: "europe", config: {} },
      ]
    : [];
  const postgresDeployments = regional
    ? [
        { id: "postgres-primary", regionId: "us-east", config: { role: "primary" } },
        { id: "postgres-europe", regionId: "europe", config: { role: "replica" } },
      ]
    : [];

  const components = [
    { id: "traffic", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: ui(0) },
    { id: "cdn", type: "cdn", config: { coverage: 1, ttlBand: "long", tier: "large" }, deployments: [], ui: ui(1) },
    { id: "router", type: "global-router", config: {}, deployments: [], ui: ui(2) },
    { id: "lb", type: "load-balancer", config: { policy: "equal" }, deployments: [], ui: ui(3) },
    {
      id: "service",
      type: "service",
      config: { size: "large", instances: 8 },
      deployments: serviceDeployments,
      ui: ui(4),
    },
    {
      id: "redis",
      type: "redis",
      config: { mode: "replicated", tier: "large", ttlBand: "long" },
      deployments: redisDeployments,
      ui: ui(5),
    },
    {
      id: "postgres",
      type: "postgres",
      config: { tier: "large", readReplicaCount: regional ? 1 : 0 },
      deployments: postgresDeployments,
      ui: ui(6),
    },
  ];

  if (includeIdleRedis) {
    components.push({
      id: "redis-idle",
      type: "redis",
      config: { mode: "standalone", tier: "small", ttlBand: "short" },
      deployments: [],
      ui: ui(5, 1),
    });
  }

  return {
    version: 1,
    components,
    connections: [
      connection("traffic-cdn", "traffic", "request_out", "cdn", "request_in", "request"),
      connection("cdn-router", "cdn", "origin_out", "router", "request_in", "request"),
      connection("router-lb", "router", "route_out", "lb", "request_in", "request"),
      connection("lb-service", "lb", "request_out", "service", "request_in", "request"),
      connection("service-redis", "service", "database_out", "redis", "cache_in", "read_write"),
      connection("redis-postgres", "redis", "origin_out", "postgres", "database_in", "read_write"),
    ],
  };
}

export function reverseArchitectureOrder(architecture) {
  return {
    ...architecture,
    components: [...architecture.components].reverse(),
    connections: [...architecture.connections].reverse(),
  };
}
