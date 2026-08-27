/**
 * CI-01 — Level 1 component composition fixture matrix.
 *
 * Usage: pnpm --filter @faultline/simulator verify:level1-component-composition
 */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { propagateTraffic } from "../dist/index.js";
import {
  createDirectServiceArchitecture,
  createSevenComponentArchitecture,
  level1CompositionChallenge,
  reverseArchitectureOrder,
} from "./fixtures/level1-composition.mjs";

function propagate(architecture) {
  const result = propagateTraffic({
    architecture,
    challenge: level1CompositionChallenge,
    registry: componentRegistry,
  });
  assert.equal(result.valid, true, "fixture architecture must pass simulation validation");
  return result;
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);
}

console.log("Check — direct logical Source → Service → Postgres path");
const direct = propagate(createDirectServiceArchitecture());
assert.equal(direct.geographicRoutes.length, 0, "logical fixture must not activate geography");
assertClose(
  direct.traffic.service.incomingRps,
  level1CompositionChallenge.workload.requestsPerSecond,
  "direct Service receives source demand",
);
assert.ok(direct.traffic.postgres.incomingRps > 0, "connected Postgres receives Service store demand");

console.log("Check — productive seven-component logical path conserves cache boundaries");
const logical = propagate(createSevenComponentArchitecture());
assert.equal(logical.geographicRoutes.length, 0, "logical seven-component fixture must not activate geography");
assert.ok(logical.caches.cdn.hitRps > 0, "on-path CDN must absorb redirects");
assertClose(
  logical.traffic.cdn.incomingRps,
  logical.caches.cdn.hitRps + logical.traffic.lb.incomingRps,
  "CDN ingress equals hit plus post-CDN forward",
);
assertClose(logical.traffic.router.incomingRps, logical.traffic.lb.incomingRps, "Router is volume-preserving");
assertClose(logical.traffic.lb.incomingRps, logical.traffic.service.incomingRps, "single Service LB output conserves RPS");
assert.ok(logical.caches.redis.hitRps > 0, "on-path Redis must absorb reads");
assertClose(
  logical.traffic.redis.incomingRps,
  logical.caches.redis.hitRps + logical.traffic.postgres.incomingRps,
  "Redis ingress equals hit plus miss/write continuation",
);

console.log("Check — productive seven-component regional path emits geographic evidence");
const regionalArchitecture = createSevenComponentArchitecture({ regional: true });
const regional = propagate(regionalArchitecture);
assert.equal(regional.regionalWorkload.active, true);
assert.ok(regional.geographicRoutes.length > 0, "regional fixture must emit geographic routes");
assert.ok(Object.keys(regional.regionalTraffic.service ?? {}).length > 0, "regional Service traffic is attributed");
assert.ok(Object.keys(regional.regionalTraffic.redis ?? {}).length > 0, "regional Redis traffic is attributed");
assert.ok(Object.keys(regional.regionalTraffic.postgres ?? {}).length > 0, "regional Postgres traffic is attributed");
assertClose(
  regional.traffic.cdn.incomingRps,
  regional.caches.cdn.hitRps + regional.traffic.lb.incomingRps,
  "geo CDN ingress equals hit plus post-CDN forward",
);

console.log("Check — disconnected cache remains idle");
const withIdleRedis = propagate(createSevenComponentArchitecture({ includeIdleRedis: true }));
assert.deepEqual(withIdleRedis.traffic["redis-idle"], {
  incomingRps: 0,
  outgoingRps: 0,
  readRps: 0,
  writeRps: 0,
});
assert.equal(withIdleRedis.caches["redis-idle"], undefined, "off-path Redis has no cache result");

console.log("Check — component and connection order cannot change result evidence");
const reordered = propagate(reverseArchitectureOrder(regionalArchitecture));
assert.deepEqual(reordered, regional, "composition results must be deterministic across input ordering");

console.log("Level 1 component composition verified");
