/** GEO-10 — end-to-end geo requirement aggregation. */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "../dist/index.js";
import { createSevenComponentArchitecture, level1CompositionChallenge } from "./fixtures/level1-composition.mjs";

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);
}

function evaluate(architecture) {
  const result = evaluateRequirements({ architecture, challenge: level1CompositionChallenge, registry: componentRegistry });
  assert.equal(result.valid, true);
  return result;
}

console.log("Check — geo requirements project from simulator outcomes");
const healthy = evaluate(createSevenComponentArchitecture({ regional: true }));
const byId = new Map(healthy.requirements.map((requirement) => [requirement.id, requirement]));
close(byId.get("throughput").actual, healthy.throughputRatio, "throughput uses geo capacity evidence");
close(byId.get("latency").actual, healthy.p95LatencyMs, "latency uses geo route evidence");
close(byId.get("headroom").actual, healthy.headroom, "headroom uses regional capacity evidence");
close(byId.get("budget").actual, healthy.cost.monthlyTotal, "budget uses geo transfer evidence");
assert.equal(healthy.hotKey.active, true);
assert.ok(healthy.events.some((event) => event.data.requirementId === "hot-key"));

console.log("Check — requirements use post-CDN Service demand");
const noCdn = createSevenComponentArchitecture({ regional: true });
noCdn.components = noCdn.components.map((component) =>
  component.id === "cdn" ? { ...component, config: { coverage: 0, ttlBand: "long", tier: "large" } } : component,
);
const noCdnResult = evaluate(noCdn);
assert.ok(noCdnResult.traffic.service.incomingRps > healthy.traffic.service.incomingRps);
assert.ok(noCdnResult.throughputRatio <= healthy.throughputRatio);
assert.equal(noCdnResult.caches.cdn.hitRps, 0);
assert.equal(
  noCdnResult.allRequirementsPass,
  noCdnResult.requirements.every((requirement) => requirement.passed) && noCdnResult.hotKey.passed,
);

console.log("geo requirements verified");
