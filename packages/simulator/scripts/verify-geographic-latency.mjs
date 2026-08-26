import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge, urlShortenerChallenge } from "@faultline/challenges";
import {
  discreteTrafficWeightedP95,
  evaluatePathLatency,
  evaluateRequirements,
  getRegionLatencyMs,
} from "../dist/index.js";

assert.equal(getRegionLatencyMs("us-east", "us-east"), 10);
assert.equal(getRegionLatencyMs("us-east", "singapore"), 220);
assert.ok(getRegionLatencyMs("tokyo", "singapore") < getRegionLatencyMs("tokyo", "us-east"));

assert.equal(
  discreteTrafficWeightedP95([
    { weight: 50, latencyMs: 100 },
    { weight: 50, latencyMs: 200 },
  ]),
  200,
);
assert.equal(
  discreteTrafficWeightedP95([
    { weight: 96, latencyMs: 80 },
    { weight: 4, latencyMs: 400 },
  ]),
  80,
);

const connectionsBase = [
  {
    id: "t-r",
    sourceComponentId: "traffic-01",
    sourcePortId: "request_out",
    targetComponentId: "router-01",
    targetPortId: "request_in",
    type: "request",
  },
  {
    id: "r-s",
    sourceComponentId: "router-01",
    sourcePortId: "route_out",
    targetComponentId: "service-01",
    targetPortId: "request_in",
    type: "request",
  },
];

function geoArchitecture({
  serviceDeployments,
  postgresDeployments,
  redisDeployments = null,
}) {
  const components = [
    {
      id: "traffic-01",
      type: "traffic-source",
      config: { label: "Incoming traffic" },
      deployments: [],
      ui: { x: 0, y: 0 },
    },
    { id: "router-01", type: "global-router", config: {}, deployments: [], ui: { x: 120, y: 0 } },
    {
      id: "service-01",
      type: "service",
      config: {
        size: "medium",
        instances: serviceDeployments.reduce((sum, deployment) => sum + deployment.config.instances, 0),
      },
      deployments: serviceDeployments,
      ui: { x: 300, y: 0 },
    },
  ];
  const connections = [...connectionsBase];

  if (redisDeployments) {
    components.push({
      id: "redis-01",
      type: "redis",
      config: { mode: "standalone", tier: "large", ttlBand: "long" },
      deployments: redisDeployments,
      ui: { x: 480, y: 0 },
    });
    components.push({
      id: "postgres-01",
      type: "postgres",
      config: {
        tier: "large",
        readReplicaCount: postgresDeployments.filter((deployment) => deployment.config.role === "replica")
          .length,
      },
      deployments: postgresDeployments,
      ui: { x: 660, y: 0 },
    });
    connections.push(
      {
        id: "s-redis",
        sourceComponentId: "service-01",
        sourcePortId: "database_out",
        targetComponentId: "redis-01",
        targetPortId: "cache_in",
        type: "read_write",
      },
      {
        id: "redis-pg",
        sourceComponentId: "redis-01",
        sourcePortId: "origin_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    );
  } else {
    components.push({
      id: "postgres-01",
      type: "postgres",
      config: {
        tier: "large",
        readReplicaCount: postgresDeployments.filter((deployment) => deployment.config.role === "replica")
          .length,
      },
      deployments: postgresDeployments,
      ui: { x: 480, y: 0 },
    });
    connections.push({
      id: "s-pg",
      sourceComponentId: "service-01",
      sourcePortId: "database_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    });
  }

  return { version: 1, components, connections };
}

const usEastOnly = geoArchitecture({
  serviceDeployments: [{ id: "svc-east", regionId: "us-east", config: { instances: 10 } }],
  postgresDeployments: [{ id: "pg-east", regionId: "us-east", config: { role: "primary" } }],
});

const multiRegion = geoArchitecture({
  serviceDeployments: [
    { id: "svc-east", regionId: "us-east", config: { instances: 3 } },
    { id: "svc-eu", regionId: "europe", config: { instances: 3 } },
    { id: "svc-sg", regionId: "singapore", config: { instances: 4 } },
  ],
  postgresDeployments: [
    { id: "pg-east", regionId: "us-east", config: { role: "primary" } },
    { id: "pg-eu", regionId: "europe", config: { role: "replica" } },
    { id: "pg-sg", regionId: "singapore", config: { role: "replica" } },
  ],
});

const distantOnly = evaluatePathLatency({
  architecture: usEastOnly,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(distantOnly.valid, true);
if (!distantOnly.valid) throw new Error("expected valid");
assert.ok(distantOnly.geographicOriginLatencies?.length > 0);
assert.ok(
  distantOnly.geographicOriginLatencies.every(
    (origin) =>
      origin.pathLatencyMs >
      origin.serviceLatencyMs + origin.postgresLatencyMs,
  ),
  "network hops must increase path latency beyond component processing",
);

const tokyoOrigin = distantOnly.geographicOriginLatencies.find((origin) => origin.originRegion === "tokyo");
const usEastOrigin = distantOnly.geographicOriginLatencies.find((origin) => origin.originRegion === "us-east");
assert.ok(tokyoOrigin && usEastOrigin);
assert.ok(
  tokyoOrigin.networkToServiceMs > usEastOrigin.networkToServiceMs,
  "Tokyo→US East must cost more network than local US East",
);
assert.ok(tokyoOrigin.pathLatencyMs > usEastOrigin.pathLatencyMs);

const closer = evaluatePathLatency({
  architecture: multiRegion,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(closer.valid, true);
if (!closer.valid) throw new Error("expected valid");
assert.ok(
  closer.p95LatencyMs < distantOnly.p95LatencyMs,
  `moving deployments closer should lower p95 (${closer.p95LatencyMs} vs ${distantOnly.p95LatencyMs})`,
);

const singaporeCloser = closer.geographicOriginLatencies.find((origin) => origin.originRegion === "singapore");
assert.ok(singaporeCloser);
assert.equal(singaporeCloser.serviceRegion, "singapore");
assert.ok(singaporeCloser.networkToDatastoreMs <= getRegionLatencyMs("singapore", "singapore") + 1e-9);

const primaryOnlyRemoteReads = geoArchitecture({
  serviceDeployments: [{ id: "svc-sg", regionId: "singapore", config: { instances: 10 } }],
  postgresDeployments: [{ id: "pg-east", regionId: "us-east", config: { role: "primary" } }],
});
const withLocalReplica = geoArchitecture({
  serviceDeployments: [{ id: "svc-sg", regionId: "singapore", config: { instances: 10 } }],
  postgresDeployments: [
    { id: "pg-east", regionId: "us-east", config: { role: "primary" } },
    { id: "pg-sg", regionId: "singapore", config: { role: "replica" } },
  ],
});

const remoteDb = evaluatePathLatency({
  architecture: primaryOnlyRemoteReads,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
const localReplica = evaluatePathLatency({
  architecture: withLocalReplica,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(remoteDb.valid, true);
assert.equal(localReplica.valid, true);
if (!remoteDb.valid || !localReplica.valid) throw new Error("expected valid");
assert.ok(
  localReplica.p95LatencyMs < remoteDb.p95LatencyMs,
  "local read replica should lower redirect p95 vs remote primary reads",
);

const withRedis = geoArchitecture({
  serviceDeployments: [
    { id: "svc-east", regionId: "us-east", config: { instances: 4 } },
    { id: "svc-sg", regionId: "singapore", config: { instances: 6 } },
  ],
  redisDeployments: [
    { id: "redis-east", regionId: "us-east", config: {} },
    { id: "redis-sg", regionId: "singapore", config: {} },
  ],
  postgresDeployments: [
    { id: "pg-east", regionId: "us-east", config: { role: "primary" } },
    { id: "pg-sg", regionId: "singapore", config: { role: "replica" } },
  ],
});
const cached = evaluatePathLatency({
  architecture: withRedis,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(cached.valid, true);
if (!cached.valid) throw new Error("expected valid");
const sgCached = cached.geographicOriginLatencies.find((origin) => origin.originRegion === "singapore");
assert.ok(sgCached);
assert.ok(sgCached.cacheHitRate > 0);
assert.ok(
  sgCached.postgresLatencyMs < cached.components["postgres-01"].p95LatencyMs,
  "cache hits must skip a share of downstream Postgres processing",
);
assert.ok(
  sgCached.networkToDatastoreMs <
    getRegionLatencyMs("singapore", "singapore") + getRegionLatencyMs("singapore", "us-east"),
  "cache hits must avoid always paying remote DB network",
);

const requirements = evaluateRequirements({
  architecture: multiRegion,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(requirements.valid, true);
if (!requirements.valid) throw new Error("expected valid");
const latencyRequirement = requirements.requirements.find((requirement) => requirement.id === "latency");
assert.ok(latencyRequirement, "expected a latency requirement");
assert.equal(latencyRequirement.actual, closer.p95LatencyMs);

const tinyLogical = {
  version: 1,
  components: [
    {
      id: "traffic-01",
      type: "traffic-source",
      config: { label: "Incoming traffic" },
      deployments: [],
      ui: { x: 0, y: 0 },
    },
    {
      id: "service-01",
      type: "service",
      config: { instances: 4 },
      deployments: [],
      ui: { x: 300, y: 0 },
    },
    {
      id: "postgres-01",
      type: "postgres",
      config: { tier: "medium" },
      deployments: [],
      ui: { x: 600, y: 0 },
    },
  ],
  connections: [
    {
      id: "traffic-service",
      sourceComponentId: "traffic-01",
      sourcePortId: "request_out",
      targetComponentId: "service-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "service-postgres",
      sourceComponentId: "service-01",
      sourcePortId: "database_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    },
  ],
};

const tiny = evaluatePathLatency({
  architecture: tinyLogical,
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
assert.equal(tiny.valid, true);
if (!tiny.valid) throw new Error("expected valid");
assert.equal(tiny.geographicOriginLatencies, undefined);
assert.equal(
  tiny.p95LatencyMs,
  tiny.components["service-01"].p95LatencyMs + tiny.components["postgres-01"].p95LatencyMs,
);

console.log("geographic latency verified");
