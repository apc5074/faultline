/**
 * CI-04 / CI-05 — Component metric provenance and requirement composition.
 *
 * Usage: pnpm --filter @faultline/simulator verify:level1-metrics-requirements
 */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "../dist/index.js";
import {
  createDirectServiceArchitecture,
  createSevenComponentArchitecture,
  level1CompositionChallenge,
} from "./fixtures/level1-composition.mjs";

function evaluate(architecture) {
  const result = evaluateRequirements({ architecture, challenge: level1CompositionChallenge, registry: componentRegistry });
  assert.equal(result.valid, true, "fixture must be valid before outcome evaluation");
  return result;
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);
}

function requirement(result, id) {
  const value = result.requirements.find((candidate) => candidate.id === id);
  assert.ok(value, `expected ${id} requirement`);
  return value;
}

function assertRequirementProjection(result) {
  assertClose(requirement(result, "throughput").actual, result.throughputRatio, "throughput requirement uses capacity result");
  assertClose(requirement(result, "latency").actual, result.p95LatencyMs, "latency requirement uses latency result");
  assertClose(requirement(result, "headroom").actual, result.headroom, "headroom requirement uses capacity result");
  assertClose(requirement(result, "budget").actual, result.cost.monthlyTotal, "budget requirement uses cost result");

  for (const value of result.requirements) {
    const event = result.events.find(
      (candidate) =>
        (candidate.type === "requirement_passed" || candidate.type === "requirement_failed") &&
        candidate.data.requirementId === value.id,
    );
    assert.ok(event, `${value.id} emits a requirement event`);
    assertClose(event.data.actual, value.actual, `${value.id} event reports requirement actual`);
    assertClose(event.data.target, value.target, `${value.id} event reports requirement target`);
  }
}

console.log("Check — direct overload exposes Service and Postgres shortfall metrics to requirements");
const direct = evaluate(createDirectServiceArchitecture());
const directService = direct.services.service;
const directPostgres = direct.postgres.postgres;
assertClose(directService.handledRps + directService.unmetRps, directService.incomingRps, "Service handled plus unmet equals incoming");
assertClose(
  directPostgres.readHandledRps + directPostgres.readCapacityShortfallRps,
  directPostgres.readRps,
  "Postgres read handled plus shortfall equals read demand",
);
assertClose(
  directPostgres.writeHandledRps + directPostgres.writeCapacityShortfallRps,
  directPostgres.writeRps,
  "Postgres write handled plus shortfall equals write demand",
);
assert.ok(directService.unmetRps > 0 || directPostgres.readCapacityShortfallRps > 0, "direct control exposes a real bottleneck");
assertRequirementProjection(direct);
assert.equal(direct.allRequirementsPass, false, "unmitigated demand cannot pass all Level 1 outcomes");

console.log("Check — layered components expose reconciled cache, capacity, and cost metrics");
const layered = evaluate(createSevenComponentArchitecture());
const cacheIds = ["cdn", "redis"];
for (const id of cacheIds) {
  const cache = layered.caches[id];
  assert.ok(cache, `${id} exposes cache metrics when active`);
  assert.ok(cache.capacityRps > 0, `${id} exposes modeled capacity`);
  assertClose(cache.hitRps + cache.missRps, cache.eligibleRps, `${id} hit plus miss equals eligible traffic`);
  assertClose(cache.downstreamAvoidedRps, cache.hitRps, `${id} avoided downstream work equals hits`);
}
const service = layered.services.service;
const postgres = layered.postgres.postgres;
assertClose(service.handledRps + service.unmetRps, service.incomingRps, "layered Service metrics reconcile");
assertClose(postgres.readHandledRps + postgres.readCapacityShortfallRps, postgres.readRps, "layered Postgres read metrics reconcile");
assertClose(postgres.writeHandledRps + postgres.writeCapacityShortfallRps, postgres.writeRps, "layered Postgres write metrics reconcile");
assert.ok(postgres.readRps < directPostgres.readRps, "cache layers reduce downstream Postgres read demand");
assertClose(postgres.writeRps, service.incomingRps * level1CompositionChallenge.workload.writeRatio, "cache layers preserve writes");

const costByComponent = new Map(layered.cost.lineItems.map((line) => [line.componentId, line.amount]));
for (const id of ["cdn", "lb", "service", "redis", "postgres"]) {
  assert.ok((costByComponent.get(id) ?? 0) > 0, `${id} contributes a modeled cost line`);
}
assert.equal(costByComponent.has("traffic"), false, "traffic source has no infrastructure cost line");
assert.equal(costByComponent.has("router"), false, "router has no infrastructure cost line");
assertRequirementProjection(layered);
assert.equal(layered.hotKey.active, true, "Level 1 hot-key outcome is active");
const hotKeyEvent = layered.events.find(
  (event) =>
    (event.type === "requirement_passed" || event.type === "requirement_failed") &&
    event.data.requirementId === "hot-key",
);
assert.ok(hotKeyEvent, "hot-key outcome emits requirement evidence");
assert.equal(layered.allRequirementsPass, layered.requirements.every((value) => value.passed) && layered.hotKey.passed);

console.log("Check — disabling component behavior changes only evidence-backed outcomes");
const noCdnArchitecture = createSevenComponentArchitecture();
noCdnArchitecture.components = noCdnArchitecture.components.map((component) =>
  component.id === "cdn" ? { ...component, config: { coverage: 0, ttlBand: "long", tier: "large" } } : component,
);
const noCdn = evaluate(noCdnArchitecture);
assert.equal(noCdn.caches.cdn.hitRps, 0, "zero CDN coverage removes CDN offload");
assert.ok(noCdn.traffic.service.incomingRps > layered.traffic.service.incomingRps, "removing CDN offload raises Service demand");
assert.ok(noCdn.traffic.postgres.readRps > layered.traffic.postgres.readRps, "removing CDN offload raises downstream reads");
assert.ok(noCdn.p95LatencyMs >= layered.p95LatencyMs, "extra modeled work cannot improve latency");
assertRequirementProjection(noCdn);

console.log("Level 1 component metrics and requirements verified");
