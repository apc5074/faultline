/**
 * Determinism check: browser-path evaluateRequirements matches verifySubmission
 * for competition-relevant fields on Tiny API and URL shortener affinity fixtures.
 *
 * Usage: pnpm --filter @faultline/web verify:submission
 */
import assert from "node:assert/strict";

import { hashChallengeConfig, tinyApiChallenge, urlShortenerChallenge } from "@faultline/challenges";
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

function assertParity(browser, server, budget) {
  assert.equal(server.ok, true);
  if (!server.ok) throw new Error(server.message);
  assert.equal(server.simulatorVersion, SIMULATOR_VERSION);
  assert.equal(server.metrics.p95LatencyMs, browser.p95LatencyMs);
  assert.equal(server.metrics.throughputRatio, browser.throughputRatio);
  assert.equal(server.metrics.headroom, browser.headroom);
  assert.deepEqual(server.cost, browser.cost);
  assert.deepEqual(server.requirements, browser.requirements);
  assert.equal(server.allRequirementsPass, browser.allRequirementsPass);
  assert.equal(server.withinBudget, browser.cost.monthlyTotal <= budget);
  assert.equal(server.eligible, server.allRequirementsPass && server.withinBudget);
  assert.equal(server.architectureHash.length, 64);
}

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
assertParity(browser, server, tinyApiChallenge.monthlyBudget);

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

// URL shortener: cache placement demotion parity under authored workloadAffinity.
const urlArchitecture = {
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
      id: "cdn-01",
      type: "cdn",
      config: { coverage: 1, ttlBand: "long", tier: "large" },
      deployments: [],
      ui: { x: 120, y: 0 },
    },
    {
      id: "lb-01",
      type: "load-balancer",
      config: { policy: "equal" },
      deployments: [],
      ui: { x: 220, y: 0 },
    },
    {
      id: "service-01",
      type: "service",
      config: { size: "large", instances: 6 },
      deployments: [],
      ui: { x: 350, y: 0 },
    },
    {
      id: "service-02",
      type: "service",
      config: { size: "large", instances: 6 },
      deployments: [],
      ui: { x: 350, y: 0 },
    },
    {
      id: "redis-01",
      type: "redis",
      config: { mode: "standalone", tier: "large", ttlBand: "long" },
      deployments: [],
      ui: { x: 550, y: 0 },
    },
    {
      id: "postgres-01",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 2 },
      deployments: [],
      ui: { x: 800, y: 0 },
    },
  ],
  connections: [
    {
      id: "t-c",
      sourceComponentId: "traffic-01",
      sourcePortId: "request_out",
      targetComponentId: "cdn-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "c-l",
      sourceComponentId: "cdn-01",
      sourcePortId: "origin_out",
      targetComponentId: "lb-01",
      targetPortId: "request_in",
      type: "request",
    },
    { id: "l1", sourceComponentId: "lb-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "l2", sourceComponentId: "lb-01", sourcePortId: "request_out", targetComponentId: "service-02", targetPortId: "request_in", type: "request" },
    {
      id: "s1-r",
      sourceComponentId: "service-01",
      sourcePortId: "database_out",
      targetComponentId: "redis-01",
      targetPortId: "cache_in",
      type: "read_write",
    },
    {
      id: "s2-r",
      sourceComponentId: "service-02",
      sourcePortId: "database_out",
      targetComponentId: "redis-01",
      targetPortId: "cache_in",
      type: "read_write",
    },
    {
      id: "r-p",
      sourceComponentId: "redis-01",
      sourcePortId: "origin_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    },
    {
      id: "s1-p",
      sourceComponentId: "service-01",
      sourcePortId: "database_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    },
    {
      id: "s2-p",
      sourceComponentId: "service-02",
      sourcePortId: "database_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    },
  ],
};

const urlBrowser = evaluateRequirements({
  architecture: urlArchitecture,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(urlBrowser.valid, true);
if (!urlBrowser.valid) throw new Error("expected valid url-shortener evaluation");

const urlTrusted = {
  id: "00000000-0000-4000-8000-000000000003",
  slug: urlShortenerChallenge.slug,
  version: urlShortenerChallenge.version,
  configHash: hashChallengeConfig(urlShortenerChallenge),
  simulatorVersion: SIMULATOR_VERSION,
  config: urlShortenerChallenge,
};

const urlServer = verifySubmission({ architecture: urlArchitecture, challengeVersion: urlTrusted });
assertParity(urlBrowser, urlServer, urlShortenerChallenge.monthlyBudget);
assert.equal(urlBrowser.caches["redis-01"].role, "read_aside");
assert.ok(urlBrowser.caches["cdn-01"].hitRate > 0.7);

console.log("server verifySubmission matches browser evaluateRequirements");
console.log(`architectureHash=${server.architectureHash}`);
console.log(`eligible=${server.eligible} monthlyTotal=${server.cost.monthlyTotal}`);
console.log(`url-shortener eligible=${urlServer.eligible} redisHitRate=${urlBrowser.caches["redis-01"].hitRate}`);
