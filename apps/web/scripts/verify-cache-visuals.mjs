/** VIS-004 — cache labels present simulator hit/miss/avoidance and hot-key facts only. */
import assert from "node:assert/strict";

import { glyphEvidenceLabel } from "../features/playground-glyphs/state.ts";

const simulation = {
  services: {},
  postgres: {},
  caches: {
    cdn: {
      eligibleRps: 100_000,
      servedEligibleRps: 100_000,
      hitRps: 75_000,
      missRps: 25_000,
      hitRate: 0.75,
      capacityRps: 120_000,
      utilization: 0.83,
      saturated: false,
      downstreamAvoidedRps: 75_000,
    },
    redis: {
      eligibleRps: 30_000,
      servedEligibleRps: 20_000,
      hitRps: 10_000,
      missRps: 20_000,
      hitRate: 1 / 3,
      capacityRps: 20_000,
      utilization: 1.5,
      saturated: true,
      downstreamAvoidedRps: 10_000,
    },
  },
  hotKey: {
    active: true,
    viralRedirectRps: 40_000,
    hops: [{ componentId: "redis", componentType: "redis", incomingViralRps: 40_000, absorbedViralRps: 10_000, forwardedViralRps: 30_000, hotKeyCapacityRps: 20_000, hotKeyUtilization: 2, saturated: true }],
    viralReachingPostgresRps: 30_000,
    saturatedComponentIds: ["redis"],
    passed: false,
    explanation: "fixture",
  },
};

assert.equal(glyphEvidenceLabel("cdn", simulation), "75% HIT");
assert.equal(glyphEvidenceLabel("redis", simulation), "SATURATED\n33% HIT\nHOT 200%");
assert.equal(glyphEvidenceLabel("cdn", simulation, { resultIsStale: true }), "STALE");

console.log("cache visuals verified");
