import assert from "node:assert/strict";

import {
  compactWorkloadAffinity,
  workloadFitFromCacheMetrics,
  workloadFitFromPlacement,
} from "../dist/index.js";

const challenge = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt: "Design infrastructure for a global URL shortening service.",
  developmentOnly: false,
  workload: { requestsPerSecond: 124_000, readRatio: 0.97, writeRatio: 0.03 },
  requirements: [],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["redis", "cdn"],
  workloadAffinity: {
    mechanisms: {
      data_cache: {
        maxEffectiveness: 0.3,
        byRole: { read_aside: 1, misplaced: 0.05 },
        unitCostPressure: 1.2,
        note: "Helps hot keys beside the DB.",
      },
      edge_cache: {
        maxEffectiveness: 0.88,
        processingLatencyPenaltyMs: 2,
        note: "Edge absorbs redirects.",
      },
    },
  },
};

const compact = compactWorkloadAffinity(challenge);
assert.ok(compact);
assert.deepEqual(compact.mechanisms.map((entry) => entry.mechanismId), ["data_cache", "edge_cache"]);
assert.equal(compact.mechanisms[0].unitCostPressure, 1.2);
assert.equal(compact.mechanisms[1].processingLatencyPenaltyMs, 2);
assert.equal(JSON.stringify(compact).includes("byRole"), false);

assert.equal(compactWorkloadAffinity({ ...challenge, workloadAffinity: undefined }), undefined);

const cacheFit = workloadFitFromCacheMetrics(
  {
    hitRps: 1_200,
    role: "misplaced",
    mechanismId: "data_cache",
    challengeCeiling: 0.015,
    playerIntent: 0.8,
    effectiveConfiguredHitRate: 0.012,
  },
  challenge,
);
assert.deepEqual(cacheFit, {
  participation: "active",
  role: "misplaced",
  mechanismId: "data_cache",
  challengeCeiling: 0.015,
  playerIntent: 0.8,
  effective: 0.012,
  unitCostPressure: 1.2,
});

const idleCache = workloadFitFromCacheMetrics(
  {
    hitRps: 0,
    role: "unreachable",
    mechanismId: "data_cache",
    challengeCeiling: 0,
    playerIntent: 0.8,
    effectiveConfiguredHitRate: 0,
  },
  challenge,
);
assert.equal(idleCache?.participation, "idle");

assert.equal(workloadFitFromCacheMetrics({ hitRps: 10 }, challenge), undefined);

const placementFit = workloadFitFromPlacement({
  participation: "active",
  role: "compute",
  mechanismId: "stateless_compute",
  challengeCeiling: 1,
  playerIntent: 1,
  effective: 1,
  unitCostPressure: 1,
  processingLatencyPenaltyMs: 0,
});
assert.deepEqual(placementFit, {
  participation: "active",
  role: "compute",
  mechanismId: "stateless_compute",
  challengeCeiling: 1,
  playerIntent: 1,
  effective: 1,
  unitCostPressure: 1,
  processingLatencyPenaltyMs: 0,
});

assert.equal(workloadFitFromPlacement(null), undefined);
assert.equal(workloadFitFromPlacement({ role: "compute" }), undefined);

console.log("verify-workload-fit-evidence: ok");
