/**
 * PHASE-3-VERIFY — Confirm Geography Changes Reality
 *
 * Small integration gate (not a large geography suite):
 * one Architecture + regional routing + latency + traffic + cost.
 */
import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge, urlShortenerChallenge } from "@faultline/challenges";
import {
  getRegion,
  getRegions,
  parseArchitecture,
  regionIds,
} from "@faultline/core";
import {
  evaluatePathLatency,
  evaluateRequirements,
  getRegionLatencyMs,
  getRegionLatencyMatrix,
} from "../dist/index.js";

function architecture({
  serviceDeployments,
  postgresDeployments,
  redisDeployments = null,
}) {
  const serviceInstances = serviceDeployments.reduce(
    (sum, deployment) => sum + deployment.config.instances,
    0,
  );
  const replicaCount = postgresDeployments.filter(
    (deployment) => deployment.config.role === "replica",
  ).length;

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
      config: { size: "large", instances: serviceInstances },
      deployments: serviceDeployments,
      ui: { x: 300, y: 0 },
    },
  ];
  const connections = [
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
      config: { tier: "large", readReplicaCount: replicaCount },
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
      config: { tier: "large", readReplicaCount: replicaCount },
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

function run(arch) {
  const requirements = evaluateRequirements({
    architecture: arch,
    challenge: urlShortenerChallenge,
    registry: componentRegistry,
  });
  assert.equal(requirements.valid, true, "architecture must simulate");
  if (!requirements.valid) throw new Error("unreachable");

  const latency = evaluatePathLatency({
    architecture: arch,
    challenge: urlShortenerChallenge,
    registry: componentRegistry,
  });
  assert.equal(latency.valid, true);
  if (!latency.valid) throw new Error("unreachable");
  assert.equal(latency.p95LatencyMs, requirements.p95LatencyMs);

  return { requirements, latency };
}

console.log("Check — geography model basics");
assert.equal(regionIds.length, 6);
assert.equal(getRegions().length, 6);
for (const id of regionIds) {
  const region = getRegion(id);
  assert.ok(Number.isFinite(region.coordinates.x));
  assert.ok(Number.isFinite(region.coordinates.y));
  assert.equal(region.health, "healthy");
}
assert.equal(getRegionLatencyMs("us-east", "europe"), 80);
assert.equal(getRegionLatencyMs("us-east", "singapore"), 220);
assert.deepEqual(getRegionLatencyMatrix()["us-east"]["europe"], 80);

const geo = urlShortenerChallenge.geographicDistribution;
assert.ok(geo);
assert.ok(Math.abs(geo.reduce((sum, entry) => sum + entry.fraction, 0) - 1) < 1e-9);
assert.ok(urlShortenerChallenge.transferPayload);

console.log("Check 2 — one Architecture serializes (no second model)");
const sample = architecture({
  serviceDeployments: [
    { id: "svc-east", regionId: "us-east", config: { instances: 6 } },
    { id: "svc-eu", regionId: "europe", config: { instances: 4 } },
  ],
  postgresDeployments: [
    { id: "pg-east", regionId: "us-east", config: { role: "primary" } },
    { id: "pg-eu", regionId: "europe", config: { role: "replica" } },
  ],
});
const roundTrip = parseArchitecture(JSON.parse(JSON.stringify(sample)));
assert.deepEqual(
  roundTrip.components.map((component) => ({
    id: component.id,
    type: component.type,
    config: component.config,
    deployments: component.deployments,
  })),
  sample.components.map((component) => ({
    id: component.id,
    type: component.type,
    config: component.config,
    deployments: component.deployments,
  })),
);
assert.deepEqual(roundTrip.connections, sample.connections);
assert.equal(componentRegistry.get("global-router").simulation.geographicRouting, true);
assert.equal(
  componentRegistry.get("global-router").configSchema.safeParse({ weightedRouting: true }).success,
  false,
);
assert.equal(
  componentRegistry.get("global-router").configSchema.safeParse({ activePassive: true }).success,
  false,
);

console.log("Check 3 — centralized US East placement");
const centralized = architecture({
  serviceDeployments: [{ id: "svc-east", regionId: "us-east", config: { instances: 10 } }],
  postgresDeployments: [{ id: "pg-east", regionId: "us-east", config: { role: "primary" } }],
});
const centralRun = run(centralized);
const central = centralRun.requirements;
const centralLatency = centralRun.latency;
assert.equal(central.regionalWorkload.active, true);
assert.equal(central.regionalWorkload.origins.length, 6);
assert.ok(
  Math.abs(central.regionalWorkload.totalRedirectRps - 120_000) < 1e-6,
  "regional redirects must sum to global redirects",
);

const requestRoutes = central.geographicRoutes.filter((route) => route.kind === "request");
assert.ok(requestRoutes.length > 0);
assert.ok(requestRoutes.every((route) => route.destinationRegion === "us-east"));
assert.ok(requestRoutes.some((route) => route.originRegion === "europe"));
assert.ok(requestRoutes.some((route) => route.originRegion === "tokyo"));
assert.ok(requestRoutes.some((route) => route.originRegion !== route.destinationRegion));

assert.ok(centralLatency.geographicOriginLatencies?.length);
const tokyo = centralLatency.geographicOriginLatencies.find((origin) => origin.originRegion === "tokyo");
const usEast = centralLatency.geographicOriginLatencies.find((origin) => origin.originRegion === "us-east");
assert.ok(tokyo && usEast);
assert.ok(tokyo.networkToServiceMs > usEast.networkToServiceMs);
assert.ok(tokyo.pathLatencyMs > usEast.pathLatencyMs);

const transferLines = central.cost.lineItems.filter(
  (item) => item.componentId.startsWith("xfer:") || item.componentId.startsWith("repl:"),
);
assert.ok(transferLines.length > 0, "cross-region transfer must appear for distant users");
assert.ok(transferLines.every((item) => item.amount > 0));

console.log("Check 4 — move Service capacity to Europe (most important)");
const withEurope = architecture({
  serviceDeployments: [
    { id: "svc-east", regionId: "us-east", config: { instances: 5 } },
    { id: "svc-eu", regionId: "europe", config: { instances: 5 } },
  ],
  postgresDeployments: [{ id: "pg-east", regionId: "us-east", config: { role: "primary" } }],
});
const europeRun = run(withEurope);
const europeCapacity = europeRun.requirements;
const europeLatency = europeRun.latency;

const europeRequestCentral = requestRoutes.filter((route) => route.originRegion === "europe");
const europeRequestMoved = europeCapacity.geographicRoutes.filter(
  (route) => route.kind === "request" && route.originRegion === "europe",
);
assert.ok(europeRequestCentral.every((route) => route.destinationRegion === "us-east"));
assert.ok(europeRequestMoved.every((route) => route.destinationRegion === "europe"));
assert.ok(
  europeRequestMoved.every(
    (route) => route.networkLatencyMs === getRegionLatencyMs("europe", "europe"),
  ),
);

const europeOriginCentral = centralLatency.geographicOriginLatencies.find(
  (origin) => origin.originRegion === "europe",
);
const europeOriginMoved = europeLatency.geographicOriginLatencies?.find(
  (origin) => origin.originRegion === "europe",
);
assert.ok(europeOriginCentral && europeOriginMoved);
assert.ok(
  europeOriginMoved.networkToServiceMs < europeOriginCentral.networkToServiceMs,
  "European users must get lower network-to-service latency after local capacity",
);
assert.equal(europeOriginMoved.serviceRegion, "europe");
assert.notEqual(europeCapacity.p95LatencyMs, central.p95LatencyMs);
assert.notEqual(europeCapacity.cost.monthlyTotal, central.cost.monthlyTotal);

// Determinism: same placement → same outcomes
const europeAgain = run(withEurope);
assert.equal(europeAgain.requirements.p95LatencyMs, europeCapacity.p95LatencyMs);
assert.equal(europeAgain.requirements.cost.monthlyTotal, europeCapacity.cost.monthlyTotal);
assert.deepEqual(europeAgain.requirements.geographicRoutes, europeCapacity.geographicRoutes);

console.log("Check 5 — Europe read replica");
const withReplica = architecture({
  serviceDeployments: [
    { id: "svc-east", regionId: "us-east", config: { instances: 5 } },
    { id: "svc-eu", regionId: "europe", config: { instances: 5 } },
  ],
  postgresDeployments: [
    { id: "pg-east", regionId: "us-east", config: { role: "primary" } },
    { id: "pg-eu", regionId: "europe", config: { role: "replica" } },
  ],
});
const replicaBundle = run(withReplica);
const replicaRun = replicaBundle.requirements;
const replicaLatency = replicaBundle.latency;

const europeReads = replicaRun.geographicRoutes.filter(
  (route) =>
    route.kind === "read" &&
    route.originRegion === "europe" &&
    route.componentId === "postgres-01",
);
assert.ok(europeReads.length > 0);
assert.ok(europeReads.every((route) => route.destinationRegion === "europe"));

const europeWrites = replicaRun.geographicRoutes.filter(
  (route) =>
    route.kind === "write" &&
    route.originRegion === "europe" &&
    route.componentId === "postgres-01",
);
assert.ok(europeWrites.length > 0);
assert.ok(europeWrites.every((route) => route.destinationRegion === "us-east"));

const europeOriginReplica = replicaLatency.geographicOriginLatencies?.find(
  (origin) => origin.originRegion === "europe",
);
assert.ok(europeOriginReplica);
assert.ok(
  europeOriginReplica.pathLatencyMs < europeOriginMoved.pathLatencyMs,
  "local replica should reduce European redirect path latency vs remote primary reads",
);
assert.ok(
  replicaRun.cost.lineItems.some((item) => item.componentId.startsWith("repl:")),
  "remote replica should add replication transfer cost",
);

console.log("Regression — Tiny API logical path still works");
const tiny = evaluateRequirements({
  architecture: {
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
        id: "t-s",
        sourceComponentId: "traffic-01",
        sourcePortId: "request_out",
        targetComponentId: "service-01",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "s-p",
        sourceComponentId: "service-01",
        sourcePortId: "database_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  },
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
assert.equal(tiny.valid, true);
if (!tiny.valid) throw new Error("unreachable");
assert.equal(tiny.geographicRoutes.length, 0);
assert.equal(tiny.regionalWorkload.active, false);
assert.ok(tiny.p95LatencyMs < 200);
assert.equal(tiny.cost.monthlyTotal, 8_000);

console.log("phase 3 geography reality verified");
