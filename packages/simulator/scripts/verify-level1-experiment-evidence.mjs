/**
 * CI-07 — Failure/experiment evidence stays deterministic and component-grounded.
 */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { evaluateExperiment } from "../dist/index.js";
import {
  createDirectServiceArchitecture,
  createSevenComponentArchitecture,
  level1CompositionChallenge,
} from "./fixtures/level1-composition.mjs";

function evaluate(architecture, experiment) {
  const result = evaluateExperiment({
    architecture,
    challenge: level1CompositionChallenge,
    registry: componentRegistry,
    experiment,
  });
  assert.equal(result.ok, true, "supported experiment must evaluate");
  return result.data;
}

console.log("Check — service failure is explicit, deterministic, and leaves architecture unchanged");
const direct = createDirectServiceArchitecture();
const directBefore = structuredClone(direct);
const serviceFailure = evaluate(direct, { type: "component_failure", parameters: { componentId: "service" } });
assert.deepEqual(direct, directBefore, "experiments must not mutate architecture");
assert.equal(serviceFailure.events[0].type, "experiment_started");
assert.equal(serviceFailure.events[1].type, "component_failed");
assert.equal(serviceFailure.events[1].componentId, "service");
assert.ok(serviceFailure.events.some((event) => event.type === "unroutable_demand"));
assert.equal(serviceFailure.outcome.throughputRatio, 0);
assert.equal(serviceFailure.outcome.allRequirementsPass, false);
assert.equal(
  JSON.stringify(serviceFailure),
  JSON.stringify(evaluate(direct, { type: "component_failure", parameters: { componentId: "service" } })),
  "same experiment input produces identical evidence",
);

console.log("Check — cache flush reports only simulator-supported cache effects");
const cached = createSevenComponentArchitecture();
const cachedBefore = structuredClone(cached);
const cacheFlush = evaluate(cached, { type: "cache_flush", parameters: { componentId: "redis" } });
assert.deepEqual(cached, cachedBefore, "cache flush must not rewrite architecture");
const flushEvent = cacheFlush.events.find((event) => event.type === "cache_flushed");
assert.equal(flushEvent?.componentId, "redis");
const coldRedis = cacheFlush.events.find(
  (event) => event.type === "component_load_changed" && event.componentId === "redis",
);
assert.equal(coldRedis?.data.hitRps, 0, "flushed Redis emits zero authoritative hits");
assert.equal(coldRedis?.data.hitRate, 0, "flushed Redis emits zero authoritative hit rate");

console.log("Check — traffic multiplier retains component and connection evidence");
const multiplied = evaluate(createSevenComponentArchitecture(), { type: "traffic_multiplier", parameters: { multiplier: 2 } });
assert.equal(multiplied.events[1].type, "traffic_multiplier_applied");
assert.equal(multiplied.events[1].data.multiplier, 2);
const storeRoute = multiplied.events.find(
  (event) => event.type === "traffic_routed" && event.connectionId === "redis-postgres" && event.componentId === "postgres",
);
assert.ok(storeRoute, "experiment preserves actual store connection identity");
assert.ok(storeRoute.data.readRequestsPerSecond > 0);
assert.ok(storeRoute.data.writeRequestsPerSecond > 0);
assert.equal(multiplied.events.at(-1)?.type, "experiment_completed");

console.log("Check — regional failure uses stable deployment/region evidence without synthetic recovery");
const regional = evaluate(createSevenComponentArchitecture({ regional: true }), {
  type: "region_failure",
  parameters: { regionId: "europe" },
});
assert.ok(regional.events.some((event) => event.type === "region_failed" && event.data.regionId === "europe"));
assert.ok(regional.events.some((event) => event.type === "traffic_rerouted"));
assert.equal(regional.events.some((event) => event.type === "region_recovered"), false);
const regionalRequest = regional.events.find(
  (event) =>
    event.type === "traffic_routed" &&
    event.componentId === "service" &&
    event.data.originRegion !== undefined &&
    event.data.deploymentId !== undefined,
);
assert.ok(regionalRequest, "regional experiment keeps traceable origin/deployment evidence");

console.log("Level 1 experiment evidence verified");
