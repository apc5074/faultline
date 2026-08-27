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

assert.match(glyphEvidenceLabel("cdn", simulation), /75% hit.*75,000 RPS hit.*25,000 RPS miss.*75,000 RPS avoided/);
assert.match(glyphEvidenceLabel("redis", simulation), /saturated cache.*33% hit.*viral hot key.*200% hot-key capacity.*saturated/);
assert.equal(glyphEvidenceLabel("cdn", simulation, { resultIsStale: true }), "Stale simulation evidence — run again");

console.log("cache visuals verified");
