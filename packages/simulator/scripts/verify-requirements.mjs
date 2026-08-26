import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { evaluateRequirements } from "../dist/index.js";

const architectureFor = (instances, tier) => ({
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "service-postgres", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
});

const evaluate = (instances, tier) =>
  evaluateRequirements({ architecture: architectureFor(instances, tier), challenge: tinyApiChallenge, registry: componentRegistry });

const byId = (result, id) => result.requirements.find((requirement) => requirement.id === id);

const underprovisioned = evaluate(2, "small");
assert.equal(underprovisioned.valid, true);
if (!underprovisioned.valid) throw new Error("Expected valid architecture.");
assert.equal(underprovisioned.allRequirementsPass, false);
assert.equal(byId(underprovisioned, "throughput").passed, false);
assert.equal(byId(underprovisioned, "latency").passed, false);
assert.equal(byId(underprovisioned, "headroom").passed, false);
assert.ok(byId(underprovisioned, "throughput").explanation.includes("handled"));
assert.ok(underprovisioned.events.some((event) => event.type === "requirement_failed"));

const insufficientHeadroom = evaluate(3, "medium");
assert.equal(insufficientHeadroom.valid, true);
if (!insufficientHeadroom.valid) throw new Error("Expected valid architecture.");
assert.equal(insufficientHeadroom.allRequirementsPass, false);
assert.equal(byId(insufficientHeadroom, "throughput").passed, true);
assert.equal(byId(insufficientHeadroom, "latency").passed, true);
assert.equal(byId(insufficientHeadroom, "headroom").passed, false);
assert.equal(byId(insufficientHeadroom, "headroom").actual, 0);
assert.equal(byId(insufficientHeadroom, "budget").passed, true);
assert.ok(byId(insufficientHeadroom, "headroom").explanation.includes("0%"));
assert.ok(byId(insufficientHeadroom, "headroom").explanation.includes("20%"));

const valid = evaluate(4, "medium");
assert.equal(valid.valid, true);
if (!valid.valid) throw new Error("Expected valid architecture.");
assert.equal(valid.allRequirementsPass, true);
assert.deepEqual(
  valid.requirements.map((requirement) => ({ id: requirement.id, passed: requirement.passed })),
  [
    { id: "throughput", passed: true },
    { id: "latency", passed: true },
    { id: "headroom", passed: true },
    { id: "budget", passed: true },
  ],
);
assert.equal(valid.cost.monthlyTotal, 8_000);
assert.ok(valid.p95LatencyMs < 200);
assert.ok(valid.headroom >= 0.2);
assert.equal(valid.services["service-01"].state, "warning");
assert.equal(valid.postgres["postgres-01"].state, "healthy");
assert.ok(valid.events.some((event) => event.type === "requirement_passed"));
assert.equal(valid.events.some((event) => event.type === "requirement_failed"), false);

const overprovisioned = evaluate(5, "medium");
assert.equal(overprovisioned.valid, true);
if (!overprovisioned.valid) throw new Error("Expected valid architecture.");
assert.equal(overprovisioned.allRequirementsPass, false);
assert.equal(byId(overprovisioned, "throughput").passed, true);
assert.equal(byId(overprovisioned, "latency").passed, true);
assert.equal(byId(overprovisioned, "headroom").passed, true);
assert.equal(byId(overprovisioned, "budget").passed, false);
assert.equal(byId(overprovisioned, "budget").actual, 9_000);
assert.equal(byId(overprovisioned, "budget").target, 8_000);

for (const requirement of valid.requirements) {
  assert.equal(typeof requirement.actual, "number");
  assert.equal(typeof requirement.target, "number");
  assert.equal(typeof requirement.explanation, "string");
  assert.ok(requirement.explanation.length > 0);
}

console.log("requirement evaluation verified");
