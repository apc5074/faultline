/**
 * CI-03 — Logical Level 1 traffic and cache composition.
 *
 * Usage: pnpm --filter @faultline/simulator verify:level1-logical-composition
 */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { propagateTraffic } from "../dist/index.js";
import {
  createCdnServiceArchitecture,
  createDirectServiceArchitecture,
  createLogicalFanoutArchitecture,
  createSevenComponentArchitecture,
  level1CompositionChallenge,
} from "./fixtures/level1-composition.mjs";

function propagate(architecture) {
  const result = propagateTraffic({ architecture, challenge: level1CompositionChallenge, registry: componentRegistry });
  assert.equal(result.valid, true, "logical fixture must be valid");
  assert.equal(result.geographicRoutes.length, 0, "logical fixture must not emit geographic routes");
  return result;
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);
}

function routedConnectionIds(result) {
  return new Set(
    result.events
      .filter((event) => event.type === "traffic_routed" && event.connectionId)
      .map((event) => event.connectionId),
  );
}

console.log("Check — direct Service → Postgres flow");
const direct = propagate(createDirectServiceArchitecture());
const workload = level1CompositionChallenge.workload;
assertClose(direct.traffic.service.incomingRps, workload.requestsPerSecond, "Service receives all direct demand");
assertClose(direct.traffic.postgres.readRps, workload.requestsPerSecond * workload.readRatio, "Postgres receives direct reads");
assertClose(direct.traffic.postgres.writeRps, workload.requestsPerSecond * workload.writeRatio, "Postgres receives direct writes");
assert.deepEqual(routedConnectionIds(direct), new Set(["traffic-service", "service-postgres"]));

console.log("Check — CDN absorbs redirects but writes continue through Service and Postgres");
const cdn = propagate(createCdnServiceArchitecture());
assert.ok(cdn.caches.cdn.hitRps > 0, "on-path CDN has hits");
const cdnForward = cdn.traffic.cdn.incomingRps - cdn.caches.cdn.hitRps;
assertClose(cdn.traffic.service.incomingRps, cdnForward, "Service receives CDN miss/write flow only");
assertClose(
  cdn.traffic.postgres.writeRps,
  cdn.traffic.service.incomingRps * workload.writeRatio,
  "CDN never absorbs writes",
);
assert.ok(routedConnectionIds(cdn).has("cdn-service"));

console.log("Check — Router and Load Balancer preserve logical fan-out policy");
const equal = propagate(createLogicalFanoutArchitecture("equal"));
assertClose(equal.traffic.router.incomingRps, workload.requestsPerSecond, "Router receives source demand");
assertClose(equal.traffic.lb.incomingRps, workload.requestsPerSecond, "LB receives Router demand");
assertClose(equal.traffic["service-small"].incomingRps, workload.requestsPerSecond / 2, "equal policy splits first Service share");
assertClose(equal.traffic["service-large"].incomingRps, workload.requestsPerSecond / 2, "equal policy splits second Service share");
assertClose(
  equal.traffic["service-small"].incomingRps + equal.traffic["service-large"].incomingRps,
  equal.traffic.lb.outgoingRps,
  "LB output equals Service allocations",
);
const weighted = propagate(createLogicalFanoutArchitecture("capacity_weighted"));
assert.ok(
  weighted.traffic["service-small"].incomingRps < workload.requestsPerSecond / 2,
  "capacity-weighted policy gives the smaller Service less than its equal share",
);
assert.ok(
  weighted.traffic["service-large"].incomingRps > workload.requestsPerSecond / 2,
  "capacity-weighted policy gives the larger Service more than its equal share",
);
assertClose(
  weighted.traffic["service-small"].incomingRps + weighted.traffic["service-large"].incomingRps,
  weighted.traffic.lb.outgoingRps,
  "capacity-weighted allocations conserve LB output",
);

console.log("Check — Redis absorbs reads while misses and writes continue to Postgres");
const layered = propagate(createSevenComponentArchitecture());
assert.ok(layered.caches.redis.hitRps > 0, "on-path Redis has hits");
assertClose(layered.traffic.redis.incomingRps, layered.traffic.service.incomingRps, "Service sends all store operations to Redis");
assertClose(
  layered.traffic.postgres.incomingRps,
  layered.traffic.redis.incomingRps - layered.caches.redis.hitRps,
  "Postgres receives only Redis misses and writes",
);
assertClose(
  layered.traffic.postgres.writeRps,
  layered.traffic.service.incomingRps * workload.writeRatio,
  "Redis never absorbs writes",
);
assert.ok(routedConnectionIds(layered).has("redis-postgres"), "miss/write continuation emits its actual connection ID");

console.log("Level 1 logical component composition verified");
