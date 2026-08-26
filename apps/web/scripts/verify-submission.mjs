/**
 * Determinism check: browser-path evaluateRequirements matches verifySubmission
 * for competition-relevant fields on a known Tiny API architecture.
 *
 * Usage: pnpm --filter @faultline/web verify:submission
 */
import assert from "node:assert/strict";

import { hashChallengeConfig, tinyApiChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements, SIMULATOR_VERSION } from "@faultline/simulator";

import { verifySubmission } from "../lib/competition/verify-submission.ts";

const architecture = {
  version: 1,
  components: [
    {
      id: "traffic-01",
      type: "traffic-source",
      config: { label: "Incoming traffic" },
      deployments: [],
      ui: { x: 0, y: 0 },
    },
    {
      id: "service-01",
      type: "service",
      config: { instances: 4 },
      deployments: [],
      ui: { x: 300, y: 0 },
    },
    {
      id: "postgres-01",
      type: "postgres",
      config: { tier: "medium" },
      deployments: [],
      ui: { x: 600, y: 0 },
    },
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
      id: "service-postgres",
      sourceComponentId: "service-01",
      sourcePortId: "database_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    },
  ],
};

const browser = evaluateRequirements({
  architecture,
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
assert.equal(browser.valid, true);
if (!browser.valid) throw new Error("expected valid browser evaluation");

const trusted = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: tinyApiChallenge.slug,
  version: tinyApiChallenge.version,
  configHash: hashChallengeConfig(tinyApiChallenge),
  simulatorVersion: SIMULATOR_VERSION,
  config: tinyApiChallenge,
};

const server = verifySubmission({ architecture, challengeVersion: trusted });
assert.equal(server.ok, true);
if (!server.ok) throw new Error(server.message);

assert.equal(server.simulatorVersion, SIMULATOR_VERSION);
assert.equal(server.metrics.p95LatencyMs, browser.p95LatencyMs);
assert.equal(server.metrics.throughputRatio, browser.throughputRatio);
assert.equal(server.metrics.headroom, browser.headroom);
assert.deepEqual(server.cost, browser.cost);
assert.deepEqual(server.requirements, browser.requirements);
assert.equal(server.allRequirementsPass, browser.allRequirementsPass);
assert.equal(server.withinBudget, browser.cost.monthlyTotal <= tinyApiChallenge.monthlyBudget);
assert.equal(server.eligible, server.allRequirementsPass && server.withinBudget);
assert.equal(server.architectureHash.length, 64);

const mismatch = verifySubmission({
  architecture,
  challengeVersion: { ...trusted, simulatorVersion: "999" },
});
assert.equal(mismatch.ok, false);
if (mismatch.ok) throw new Error("expected simulator mismatch");
assert.equal(mismatch.code, "simulator_mismatch");

const invalid = verifySubmission({
  architecture: { version: 1, components: "nope", connections: [] },
  challengeVersion: trusted,
});
assert.equal(invalid.ok, false);
if (invalid.ok) throw new Error("expected invalid architecture");
assert.equal(invalid.code, "invalid_architecture");

console.log("server verifySubmission matches browser evaluateRequirements");
console.log(`architectureHash=${server.architectureHash}`);
console.log(`eligible=${server.eligible} monthlyTotal=${server.cost.monthlyTotal}`);
