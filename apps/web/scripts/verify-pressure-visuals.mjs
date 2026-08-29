/** VIS-003 — capacity presentation consumes simulator metrics without local thresholds. */
import assert from "node:assert/strict";

import { outlineProps } from "../features/playground-glyphs/glyph-outline.ts";
import {
  deriveGlyphMechanismValues,
  deriveGlyphState,
  glyphEvidenceLabel,
  glyphPressureLabel,
} from "../features/playground-glyphs/state.ts";

const simulation = {
  services: {
    svc: {
      incomingRps: 120_000,
      capacityRps: 100_000,
      handledRps: 100_000,
      unmetRps: 20_000,
      utilization: 1.2,
      headroom: -20_000,
      state: "saturated",
      regions: [{ regionId: "us-east", deploymentId: "svc-east", incomingRps: 90_000, capacityRps: 50_000, utilization: 1.8, state: "saturated" }],
    },
  },
  postgres: {
    pg: {
      readRps: 30_000,
      writeRps: 8_000,
      primaryReadRps: 10_000,
      replicaReadRps: 20_000,
      primaryReadCapacityRps: 12_000,
      replicaReadCapacityRps: 16_000,
      readCapacityRps: 28_000,
      writeCapacityRps: 4_000,
      readReplicaCount: 2,
      readUtilization: 1.071,
      writeUtilization: 2,
      effectiveUtilization: 2,
      readHandledRps: 28_000,
      writeHandledRps: 4_000,
      readCapacityShortfallRps: 2_000,
      writeCapacityShortfallRps: 4_000,
      state: "saturated",
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

assert.equal(deriveGlyphState("svc", simulation), "saturated");
assert.equal(deriveGlyphState("pg", simulation), "saturated");
assert.equal(deriveGlyphState("svc", simulation, { resultIsStale: true }), "stale");
assert.equal(glyphPressureLabel("svc", simulation), "SATURATED · 20k unmet");
assert.equal(glyphPressureLabel("pg", simulation), "SATURATED");
assert.equal(glyphEvidenceLabel("redis", simulation), "HOT 200%");
assert.equal(glyphPressureLabel("svc", simulation, { resultIsStale: true }), "STALE");
assert.deepEqual(deriveGlyphMechanismValues("pg", simulation, { redirectRps: 100_000 }), {
  processingCount: 4,
  readProcessingCount: 4,
  writeProcessingCount: 4,
});

console.log("Check — three-state run grammar: working → straining → failing");
const criticalService = {
  ...simulation,
  services: { svc: { ...simulation.services.svc, state: "critical" } },
};
assert.equal(
  deriveGlyphState("svc", criticalService),
  "warning",
  "critical band folds into the straining telegraph",
);
const warningService = {
  ...simulation,
  services: { svc: { ...simulation.services.svc, state: "warning" } },
};
assert.equal(deriveGlyphState("svc", warningService), "warning");

const nearCapacityCache = {
  services: {},
  postgres: {},
  caches: { redis: { saturated: false, utilization: 0.95 } },
};
assert.equal(
  deriveGlyphState("redis", nearCapacityCache),
  "warning",
  "cache near capacity telegraphs strain instead of jumping to failure",
);
const saturatedCache = {
  services: {},
  postgres: {},
  caches: { redis: { saturated: true, utilization: 1.2 } },
};
assert.equal(deriveGlyphState("redis", saturatedCache), "saturated");

console.log("Check — outline grammar: failing is red, straining is heavier ink, working is default");
assert.equal(outlineProps("saturated").stroke, "var(--color-signal-red)");
assert.equal(outlineProps("overloaded").stroke, "var(--color-signal-red)");
assert.equal(outlineProps("failed").stroke, "var(--color-signal-red)");
assert.equal(outlineProps("warning").stroke, "var(--color-ink)");
assert.equal(outlineProps("critical").stroke, "var(--color-ink)"); // prettier-ignore
assert.ok(
  outlineProps("warning").strokeWidth > outlineProps("processing").strokeWidth,
  "straining must read heavier than working",
);

console.log("pressure visuals verified");
