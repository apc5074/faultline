/** GEO-08 — geo hot-key relief and primary-bound correctness. */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { evaluateHotKeyScenario } from "../dist/index.js";
import { createSevenComponentArchitecture, level1CompositionChallenge } from "./fixtures/level1-composition.mjs";

const challenge = {
  ...level1CompositionChallenge,
  workload: { ...level1CompositionChallenge.workload, hotKeyReadFraction: 0.5 },
};

function evaluate(architecture) {
  const result = evaluateHotKeyScenario({ architecture, challenge, registry: componentRegistry });
  assert.equal(result.valid, true, result.valid ? undefined : JSON.stringify(result.errors));
  return result.hotKey;
}

console.log("Check — geo CDN + independent regional Redis footprints absorb viral traffic");
const strong = evaluate(createSevenComponentArchitecture({ regional: true }));
assert.equal(strong.passed, true);
assert.ok(strong.viralReachingPostgresRps < strong.viralRedirectRps);
const redisHop = strong.hops.find((hop) => hop.componentId === "redis");
assert.ok(redisHop);
assert.equal(redisHop.hotKeyCapacityRps, 90_000, "two regional replicated Redis footprints sum hot-key capacity");

console.log("Check — replicas alone cannot shard one viral key");
const replicasOnly = createSevenComponentArchitecture({ regional: true });
replicasOnly.components = replicasOnly.components.filter((component) => !["cdn", "redis"].includes(component.id));
replicasOnly.connections = replicasOnly.connections
  .filter((connection) => !["traffic-cdn", "cdn-router", "service-redis", "redis-postgres"].includes(connection.id))
  .concat({
    id: "traffic-router",
    sourceComponentId: "traffic",
    sourcePortId: "request_out",
    targetComponentId: "router",
    targetPortId: "request_in",
    type: "request",
  }, {
    id: "service-postgres",
    sourceComponentId: "service",
    sourcePortId: "database_out",
    targetComponentId: "postgres",
    targetPortId: "database_in",
    type: "read_write",
  });
const replicaHotKey = evaluate(replicasOnly);
assert.equal(replicaHotKey.passed, false);
const postgresHop = replicaHotKey.hops.find((hop) => hop.componentId === "postgres");
assert.ok(postgresHop?.saturated);

console.log("geo hot-key verified");
