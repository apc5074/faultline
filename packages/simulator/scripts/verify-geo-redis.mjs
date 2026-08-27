/**
 * GEO-05 — Redis regional footprints are independent read-aside caches.
 *
 * Usage: pnpm --filter @faultline/simulator build && node packages/simulator/scripts/verify-geo-redis.mjs
 */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { estimateMonthlyCost, propagateTraffic } from "../dist/index.js";
import { createSevenComponentArchitecture, level1CompositionChallenge } from "./fixtures/level1-composition.mjs";

const challenge = {
  ...level1CompositionChallenge,
  workload: {
    ...level1CompositionChallenge.workload,
    requestsPerSecond: 1_000_000,
  },
};

function run(architecture) {
  const result = propagateTraffic({ architecture, challenge, registry: componentRegistry });
  assert.equal(result.valid, true);
  return result;
}

console.log("Check — each Redis regional footprint has independent capacity");
const regional = createSevenComponentArchitecture({ regional: true });
regional.components = regional.components.map((component) => {
  if (component.id === "cdn") return { ...component, config: { ...component.config, coverage: 0 } };
  if (component.id === "redis") {
    return {
      ...component,
      config: { mode: "standalone", tier: "small", ttlBand: "medium" },
    };
  }
  return component;
});
const independent = run(regional);
const redis = independent.caches.redis;
assert.equal(redis.capacityRps, 40_000, "two small regional footprints must expose two capacities");
assert.ok(redis.saturated, "each busy regional footprint should saturate independently");
assert.ok(independent.regionalTraffic.redis["us-east"]);
assert.ok(independent.regionalTraffic.redis.europe);
const redisCost = estimateMonthlyCost({
  architecture: regional,
  registry: componentRegistry,
  traffic: independent.traffic,
  geographicRoutes: independent.geographicRoutes,
  challenge,
});
assert.equal(
  redisCost.lineItems.find((line) => line.componentId === "redis")?.amount,
  3_000,
  "two standalone small Redis footprints must cost twice one footprint",
);

console.log("Check — same-region Redis absorbs reads and writes pierce");
const noRedisArchitecture = createSevenComponentArchitecture({ regional: true });
noRedisArchitecture.components = noRedisArchitecture.components.filter((component) => component.id !== "redis");
noRedisArchitecture.connections = [
  ...noRedisArchitecture.connections.filter((connection) => !["service-redis", "redis-postgres"].includes(connection.id)),
  {
    id: "service-postgres",
    sourceComponentId: "service",
    sourcePortId: "database_out",
    targetComponentId: "postgres",
    targetPortId: "database_in",
    type: "read_write",
  },
];
const noRedis = run(noRedisArchitecture);
const withRedis = run(createSevenComponentArchitecture({ regional: true }));
assert.ok(withRedis.caches.redis.hitRps > 0, "regional Redis must absorb eligible reads");
assert.ok(withRedis.traffic.postgres.readRps < noRedis.traffic.postgres.readRps, "Redis hits must reduce Postgres reads");
assert.ok(
  Math.abs(withRedis.traffic.postgres.writeRps - withRedis.traffic.service.incomingRps * challenge.workload.writeRatio) < 1e-6,
  "Redis must not absorb writes",
);
assert.ok(Math.abs(withRedis.caches.cdn.hitRps - noRedis.caches.cdn.hitRps) < 1e-6, "Redis placement must not change CDN absorb");

console.log("Check — disconnected Redis stays idle");
const withIdle = run(createSevenComponentArchitecture({ regional: true, includeIdleRedis: true }));
assert.equal(withIdle.traffic["redis-idle"].incomingRps, 0);
assert.equal(withIdle.caches["redis-idle"], undefined);

console.log("geo Redis footprints verified");
