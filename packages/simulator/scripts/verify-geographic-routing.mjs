import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { urlShortenerChallenge } from "@faultline/challenges";
import {
  getRegionLatencyMs,
  propagateTraffic,
  selectNearestHealthyDeployment,
} from "../dist/index.js";

assert.equal(componentRegistry.get("global-router").simulation.geographicRouting, true);

const architecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "router-01", type: "global-router", config: {}, deployments: [], ui: { x: 120, y: 0 } },
    {
      id: "service-01",
      type: "service",
      config: { size: "medium", instances: 9 },
      deployments: [
        { id: "dep-us-east", regionId: "us-east", config: { instances: 4 } },
        { id: "dep-europe", regionId: "europe", config: { instances: 3 } },
        { id: "dep-singapore", regionId: "singapore", config: { instances: 2 } },
      ],
      ui: { x: 300, y: 0 },
    },
    {
      id: "redis-01",
      type: "redis",
      config: { mode: "standalone", tier: "large", ttlBand: "long" },
      deployments: [
        { id: "dep-redis-eu", regionId: "europe", config: {} },
        { id: "dep-redis-sg", regionId: "singapore", config: {} },
      ],
      ui: { x: 480, y: 0 },
    },
    {
      id: "postgres-01",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 2 },
      deployments: [
        { id: "dep-pg-primary", regionId: "us-east", config: { role: "primary" } },
        { id: "dep-pg-eu", regionId: "europe", config: { role: "replica" } },
        { id: "dep-pg-sg", regionId: "singapore", config: { role: "replica" } },
      ],
      ui: { x: 660, y: 0 },
    },
  ],
  connections: [
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
  ],
};

const result = propagateTraffic({
  architecture,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(result.valid, true);
if (!result.valid) throw new Error("expected valid geographic traffic");

assert.equal(result.regionalWorkload.active, true);
assert.ok(result.geographicRoutes.length > 0);

const requestRoutes = result.geographicRoutes.filter((route) => route.kind === "request");
const europeRequest = requestRoutes.find((route) => route.originRegion === "europe");
assert.ok(europeRequest);
assert.equal(europeRequest.destinationRegion, "europe");
assert.equal(europeRequest.componentId, "service-01");
assert.equal(europeRequest.networkLatencyMs, getRegionLatencyMs("europe", "europe"));

const singaporeRequest = requestRoutes.find((route) => route.originRegion === "singapore");
assert.ok(singaporeRequest);
assert.equal(singaporeRequest.destinationRegion, "singapore");

const tokyoRequest = requestRoutes.find((route) => route.originRegion === "tokyo");
assert.ok(tokyoRequest);
// Tokyo → Singapore is 70ms, Tokyo → Europe is 220ms, Tokyo → US East is 160ms → Singapore wins.
assert.equal(tokyoRequest.destinationRegion, "singapore");
assert.equal(tokyoRequest.networkLatencyMs, getRegionLatencyMs("tokyo", "singapore"));

assert.ok(result.regionalTraffic["service-01"]?.europe?.incomingRps > 0);
assert.ok(result.regionalTraffic["service-01"]?.singapore?.incomingRps > 0);

const writeRoutes = result.geographicRoutes.filter((route) => route.kind === "write");
assert.ok(writeRoutes.length > 0);
assert.ok(writeRoutes.every((route) => route.destinationRegion === "us-east"));

const readRoutes = result.geographicRoutes.filter(
  (route) => route.kind === "read" && route.componentId === "postgres-01",
);
assert.ok(readRoutes.some((route) => route.destinationRegion === "europe"));
assert.ok(readRoutes.some((route) => route.destinationRegion === "singapore"));

// Tie-break stability: equal latency candidates order by componentId then deploymentId.
const tied = selectNearestHealthyDeployment("us-east", [
  {
    componentId: "service-b",
    deployment: { id: "dep-b", regionId: "us-east", config: { instances: 1 } },
    regionId: "us-east",
  },
  {
    componentId: "service-a",
    deployment: { id: "dep-a", regionId: "us-east", config: { instances: 1 } },
    regionId: "us-east",
  },
]);
assert.equal(tied?.componentId, "service-a");

// Logical-only (no deployments) still works without geographic routes.
const logical = propagateTraffic({
  architecture: {
    version: 1,
    components: [
      { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
      { id: "service-01", type: "service", config: { size: "medium", instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
      { id: "postgres-01", type: "postgres", config: { tier: "medium", readReplicaCount: 0 }, deployments: [], ui: { x: 600, y: 0 } },
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
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(logical.valid, true);
if (!logical.valid) throw new Error("expected valid logical traffic");
assert.equal(logical.geographicRoutes.length, 0);
assert.equal(logical.traffic["service-01"].incomingRps, 124_000);

console.log("geographic routing verified");
