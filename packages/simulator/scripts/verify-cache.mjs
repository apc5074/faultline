import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { evaluateCacheOffload, evaluateRequirements, propagateTraffic } from "../dist/index.js";

const challengeWithCaches = {
  ...tinyApiChallenge,
  allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "redis", "cdn"],
};

const baseComponents = [
  { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
  { id: "service-01", type: "service", config: { size: "medium", instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
  { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 700, y: 0 } },
];

const direct = propagateTraffic({
  architecture: {
    version: 1,
    components: baseComponents,
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
  },
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
assert.equal(direct.valid, true);
if (!direct.valid) throw new Error("Expected direct architecture.");
assert.deepEqual(direct.caches, {});
assert.equal(direct.traffic["postgres-01"].readRps, 5_400);
assert.equal(direct.traffic["postgres-01"].writeRps, 600);

const withRedis = propagateTraffic({
  architecture: {
    version: 1,
    components: [
      ...baseComponents.slice(0, 2),
      {
        id: "redis-01",
        type: "redis",
        config: { mode: "standalone", tier: "medium", ttlBand: "medium" },
        deployments: [],
        ui: { x: 500, y: 0 },
      },
      baseComponents[2],
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
        id: "service-redis",
        sourceComponentId: "service-01",
        sourcePortId: "database_out",
        targetComponentId: "redis-01",
        targetPortId: "cache_in",
        type: "read_write",
      },
      {
        id: "redis-postgres",
        sourceComponentId: "redis-01",
        sourcePortId: "origin_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  },
  challenge: challengeWithCaches,
  registry: componentRegistry,
});
assert.equal(withRedis.valid, true);
if (!withRedis.valid) throw new Error("Expected redis architecture.");
assert.equal(withRedis.traffic["service-01"].incomingRps, 6_000);
assert.equal(withRedis.caches["redis-01"].eligibleRps, 5_400);
assert.equal(withRedis.caches["redis-01"].hitRps, 5_400 * 0.75);
assert.equal(withRedis.traffic["postgres-01"].readRps, 5_400 * 0.25);
assert.equal(withRedis.traffic["postgres-01"].writeRps, 600);
assert.ok(withRedis.traffic["postgres-01"].readRps < direct.traffic["postgres-01"].readRps);

const withCdn = propagateTraffic({
  architecture: {
    version: 1,
    components: [
      baseComponents[0],
      {
        id: "cdn-01",
        type: "cdn",
        config: { coverage: 0.8, ttlBand: "medium", tier: "medium" },
        deployments: [],
        ui: { x: 150, y: 0 },
      },
      baseComponents[1],
      baseComponents[2],
    ],
    connections: [
      {
        id: "traffic-cdn",
        sourceComponentId: "traffic-01",
        sourcePortId: "request_out",
        targetComponentId: "cdn-01",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "cdn-service",
        sourceComponentId: "cdn-01",
        sourcePortId: "origin_out",
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
  },
  challenge: challengeWithCaches,
  registry: componentRegistry,
});
assert.equal(withCdn.valid, true);
if (!withCdn.valid) throw new Error("Expected cdn architecture.");
// eligible = 6000 * 0.9 * 0.8 = 4320; hits = 4320 * 0.75 = 3240; origin = 2760
assert.equal(withCdn.caches["cdn-01"].hitRps, 3_240);
assert.equal(withCdn.traffic["service-01"].incomingRps, 2_760);
assert.ok(withCdn.traffic["service-01"].incomingRps < direct.traffic["service-01"].incomingRps);
assert.equal(withCdn.traffic["postgres-01"].writeRps, 2_760 * 0.1);

const layered = propagateTraffic({
  architecture: {
    version: 1,
    components: [
      baseComponents[0],
      {
        id: "cdn-01",
        type: "cdn",
        config: { coverage: 0.8, ttlBand: "medium", tier: "medium" },
        deployments: [],
        ui: { x: 150, y: 0 },
      },
      baseComponents[1],
      {
        id: "redis-01",
        type: "redis",
        config: { mode: "standalone", tier: "medium", ttlBand: "medium" },
        deployments: [],
        ui: { x: 500, y: 0 },
      },
      baseComponents[2],
    ],
    connections: [
      {
        id: "traffic-cdn",
        sourceComponentId: "traffic-01",
        sourcePortId: "request_out",
        targetComponentId: "cdn-01",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "cdn-service",
        sourceComponentId: "cdn-01",
        sourcePortId: "origin_out",
        targetComponentId: "service-01",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "service-redis",
        sourceComponentId: "service-01",
        sourcePortId: "database_out",
        targetComponentId: "redis-01",
        targetPortId: "cache_in",
        type: "read_write",
      },
      {
        id: "redis-postgres",
        sourceComponentId: "redis-01",
        sourcePortId: "origin_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  },
  challenge: challengeWithCaches,
  registry: componentRegistry,
});
assert.equal(layered.valid, true);
if (!layered.valid) throw new Error("Expected layered architecture.");
// Service sees CDN misses only; Redis hits apply to remaining reads — not to original 120k/6k.
assert.equal(layered.traffic["service-01"].incomingRps, 2_760);
assert.equal(layered.caches["redis-01"].eligibleRps, 2_760 * 0.9);
assert.equal(layered.traffic["postgres-01"].readRps, 2_760 * 0.9 * 0.25);
assert.ok(layered.traffic["postgres-01"].readRps < withCdn.traffic["postgres-01"].readRps);

const saturated = evaluateCacheOffload({
  eligibleRps: 100_000,
  configuredHitRate: 0.9,
  capacityRps: 10_000,
});
assert.equal(saturated.saturated, true);
assert.equal(saturated.hitRps, 9_000);
assert.equal(saturated.missRps, 91_000);

const requirements = evaluateRequirements({
  architecture: {
    version: 1,
    components: baseComponents,
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
  },
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
assert.equal(requirements.valid, true);
if (!requirements.valid) throw new Error("Expected requirements result.");
assert.deepEqual(requirements.caches, {});

console.log("cache behavior verified");
