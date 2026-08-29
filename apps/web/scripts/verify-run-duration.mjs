/**
 * RUN-002 — run duration policy: every run lasts 1–5s, scaled by traffic and
 * requirement-miss severity; pure, deterministic, monotone; errors bypass.
 *
 * Usage: pnpm --filter @faultline/web verify:run-duration
 */
import assert from "node:assert/strict";

import { urlShortenerChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "@faultline/simulator";

import { buildLevel1HeroScene } from "../features/architecture-canvas/level1-hero-scene.ts";
import {
  MAX_RUN_DURATION_MS,
  MIN_RUN_DURATION_MS,
  requirementMissSeverity,
  runDurationBreakdown,
  runDurationMs,
  runTimelineDurationMs,
} from "../features/architecture-canvas/run-duration.ts";

function component(id, type, config) {
  return { id, type, config, deployments: [], ui: { x: 0, y: 0 } };
}

function edge(id, sourceComponentId, sourcePortId, targetComponentId, targetPortId, type) {
  return { id, sourceComponentId, sourcePortId, targetComponentId, targetPortId, type };
}

function weakArchitecture() {
  return {
    version: 1,
    components: [
      component("t1", "traffic-source", { label: "Incoming traffic" }),
      component("svc1", "service", { size: "small", instances: 1 }),
      component("pg1", "postgres", { tier: "small" }),
    ],
    connections: [
      edge("e1", "t1", "request_out", "svc1", "request_in", "request"),
      edge("e2", "svc1", "database_out", "pg1", "database_in", "read_write"),
    ],
  };
}

function evaluate(architecture) {
  const result = evaluateRequirements({
    architecture,
    challenge: urlShortenerChallenge,
    registry: componentRegistry,
  });
  assert.equal(result.valid, true, "fixture should evaluate successfully");
  return result;
}

console.log("Check — real fixtures land inside the 1–5s window, deterministically");
const heroResult = evaluate(buildLevel1HeroScene());
const weakResult = evaluate(weakArchitecture());
assert.equal(heroResult.allRequirementsPass, true, "hero scene should pass all requirements");
assert.equal(weakResult.allRequirementsPass, false, "weak architecture should fail requirements");

for (const [name, result] of [
  ["hero", heroResult],
  ["weak", weakResult],
]) {
  const duration = runDurationMs(result);
  assert.ok(
    duration >= MIN_RUN_DURATION_MS && duration <= MAX_RUN_DURATION_MS,
    `${name} duration ${duration}ms outside [${MIN_RUN_DURATION_MS}, ${MAX_RUN_DURATION_MS}]`,
  );
  assert.equal(runDurationMs(result), duration, `${name} duration must be deterministic`);
  const breakdown = runDurationBreakdown(result);
  assert.equal(
    breakdown.totalMs,
    duration,
    `${name} breakdown total should match runDurationMs`,
  );
}

const weakBreakdown = runDurationBreakdown(weakResult);
assert.ok(weakBreakdown.missTermMs > 0, "failing run should include a miss term");

console.log("Check — zero traffic resolves to the floor");
const zeroTraffic = {
  ...heroResult,
  traffic: {},
  requirements: heroResult.requirements.map((requirement) => ({ ...requirement, passed: true })),
  hotKey: { ...heroResult.hotKey, active: false, passed: true },
};
assert.equal(runDurationMs(zeroTraffic), MIN_RUN_DURATION_MS);

console.log("Check — catastrophic miss saturates at the cap");
const catastrophic = {
  ...weakResult,
  traffic: Object.fromEntries(
    Object.keys(weakResult.traffic).map((id) => [
      id,
      { incomingRps: 10_000_000, outgoingRps: 10_000_000, readRps: 10_000_000, writeRps: 10_000_000 },
    ]),
  ),
  requirements: weakResult.requirements.map((requirement) => ({
    ...requirement,
    passed: false,
    actual: requirement.operator === "gte" ? 0 : requirement.target * 10,
  })),
  hotKey: { active: true, passed: false, viralRedirectRps: 10_000_000 },
};
assert.equal(runDurationMs(catastrophic), MAX_RUN_DURATION_MS);

console.log("Check — worse misses and heavier traffic never shorten the run");
const failingRequirement = weakResult.requirements.find((requirement) => !requirement.passed);
assert.ok(failingRequirement, "weak fixture should have a failing requirement");
const worseMiss = {
  ...weakResult,
  requirements: weakResult.requirements.map((requirement) =>
    requirement.id === failingRequirement.id
      ? {
          ...requirement,
          actual:
            requirement.operator === "gte"
              ? requirement.actual / 2
              : requirement.actual * 2,
        }
      : requirement,
  ),
};
assert.ok(
  runDurationMs(worseMiss) >= runDurationMs(weakResult),
  "a worse miss must not shorten the run",
);

const heavierTraffic = {
  ...weakResult,
  traffic: Object.fromEntries(
    Object.entries(weakResult.traffic).map(([id, traffic]) => [
      id,
      { ...traffic, incomingRps: traffic.incomingRps * 2 },
    ]),
  ),
};
assert.ok(
  runDurationMs(heavierTraffic) >= runDurationMs(weakResult),
  "heavier traffic must not shorten the run",
);

console.log("Check — miss severity is normalized and directional");
assert.equal(
  requirementMissSeverity({ ...failingRequirement, passed: true }),
  0,
  "passed requirements contribute nothing",
);
assert.equal(
  requirementMissSeverity({
    id: "r", type: "throughput", passed: false, actual: 0.5, target: 1, operator: "gte", explanation: "",
  }),
  0.5,
);
assert.equal(
  requirementMissSeverity({
    id: "r", type: "latency", passed: false, actual: 400, target: 200, operator: "lt", explanation: "",
  }),
  1,
  "overshoot clamps at 1",
);

console.log("Check — invalid evaluations bypass the timed replay");
const invalidResult = evaluateRequirements({
  architecture: { version: 1, components: [], connections: [] },
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(invalidResult.valid, false, "empty architecture should be invalid");
assert.equal(runTimelineDurationMs(invalidResult), null);
assert.equal(runTimelineDurationMs(heroResult), runDurationMs(heroResult));

console.log("run duration verified");
