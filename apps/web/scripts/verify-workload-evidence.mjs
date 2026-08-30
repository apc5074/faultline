/**
 * T-08 — workload evidence panels and playback glyph visuals derive from simulator metrics only.
 *
 * Usage: pnpm --filter @faultline/web verify:workload-evidence
 */
import assert from "node:assert/strict";

import { urlShortenerChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "@faultline/simulator";

import {
  buildWorkloadEvidencePanel,
  workloadBriefingPlacementHint,
} from "../features/architecture-canvas/workload-evidence.ts";
import { deriveGlyphMechanismValues } from "../features/playground-glyphs/state.ts";
import { buildComponentPlaybackVisuals } from "../features/traffic-playback/playback-component-visuals.ts";
import { impactSlotSeed, randomizedImpactSlots } from "../features/traffic-playback/impact-slots.ts";

const trafficSourceConfig = { label: "Incoming traffic" };
const redisConfig = { mode: "standalone", tier: "medium", ttlBand: "medium" };
const serviceConfig = { size: "medium", instances: 4 };
const postgresConfig = { tier: "medium" };

function component(id, type, config) {
  return { id, type, config, deployments: [], ui: { x: 0, y: 0 } };
}

function edge(id, sourceComponentId, sourcePortId, targetComponentId, targetPortId, type) {
  return { id, sourceComponentId, sourcePortId, targetComponentId, targetPortId, type };
}

function readAsideArchitecture() {
  return {
    version: 1,
    components: [
      component("t1", "traffic-source", trafficSourceConfig),
      component("svc1", "service", serviceConfig),
      component("redis1", "redis", redisConfig),
      component("pg1", "postgres", postgresConfig),
    ],
    connections: [
      edge("e1", "t1", "request_out", "svc1", "request_in", "request"),
      edge("e2", "svc1", "database_out", "redis1", "cache_in", "read_write"),
      edge("e3", "redis1", "origin_out", "pg1", "database_in", "read_write"),
      edge("e4", "svc1", "database_out", "pg1", "database_in", "read_write"),
    ],
  };
}

function misplacedArchitecture() {
  return {
    version: 1,
    components: [
      component("t1", "traffic-source", trafficSourceConfig),
      component("svc1", "service", serviceConfig),
      component("redis1", "redis", redisConfig),
      component("redis2", "redis", redisConfig),
    ],
    connections: [
      edge("e1", "t1", "request_out", "svc1", "request_in", "request"),
      edge("e2", "svc1", "database_out", "redis1", "cache_in", "read_write"),
      edge("e3", "redis1", "origin_out", "redis2", "cache_in", "read_write"),
    ],
  };
}

function idleRedisArchitecture() {
  return {
    version: 1,
    components: [
      component("t1", "traffic-source", trafficSourceConfig),
      component("svc1", "service", serviceConfig),
      component("redis1", "redis", redisConfig),
      component("pg1", "postgres", postgresConfig),
    ],
    connections: [
      edge("e1", "t1", "request_out", "svc1", "request_in", "request"),
      edge("e2", "svc1", "database_out", "pg1", "database_in", "read_write"),
    ],
  };
}

console.log("Check — briefing exposes authored placement hints");
const hint = workloadBriefingPlacementHint(urlShortenerChallenge);
assert.ok(hint && hint.length > 20, "placement hint should summarize edge + data cache roles");

console.log("Check — inspector distinguishes read-aside vs misplaced Redis");
const readAsideSim = evaluateRequirements({
  architecture: readAsideArchitecture(),
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(readAsideSim.valid, true);
const misplacedSim = evaluateRequirements({
  architecture: misplacedArchitecture(),
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(misplacedSim.valid, true);

const readAsidePanel = buildWorkloadEvidencePanel({
  component: readAsideArchitecture().components[2],
  challenge: urlShortenerChallenge,
  caches: readAsideSim.caches,
});
const misplacedPanel = buildWorkloadEvidencePanel({
  component: misplacedArchitecture().components[2],
  challenge: urlShortenerChallenge,
  caches: misplacedSim.caches,
  workloadPaths: misplacedSim.workloadPaths,
});

assert.match(
  readAsidePanel.rows.find((row) => row.label === "Architectural role")?.value ?? "",
  /Read-aside/,
);
assert.match(
  misplacedPanel.rows.find((row) => row.label === "Architectural role")?.value ?? "",
  /Misplaced/,
);
assert.ok(misplacedPanel.hint?.includes("topology"), "misplaced cache should coach on topology");
assert.ok(
  misplacedPanel.rows.some((row) => row.label === "Path completion" && row.value.startsWith("Incomplete")),
  "inspector should expose simulator-owned incomplete path evidence",
);

console.log("Check — idle off-path Redis stays quiet in inspector + settled glyph");
const idleSim = evaluateRequirements({
  architecture: idleRedisArchitecture(),
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(idleSim.valid, true);
assert.equal(idleSim.caches["redis1"], undefined, "off-path Redis should not emit cache metrics");

const idlePanel = buildWorkloadEvidencePanel({
  component: idleRedisArchitecture().components[2],
  challenge: urlShortenerChallenge,
  caches: idleSim.caches,
});
assert.equal(idlePanel, null, "off-path Redis has no workload panel until it participates");

const idleGlyph = deriveGlyphMechanismValues("redis1", idleSim, {
  redirectRps:
    urlShortenerChallenge.workload.requestsPerSecond * urlShortenerChallenge.workload.readRatio,
});
assert.deepEqual(idleGlyph, {}, "off-path Redis glyph stays quiet");

console.log("Check — playback cache cubes use seeded random slots; servers stay sequential bays");
const architecture = readAsideArchitecture();
const playbackContext = {
  runId: "baseline-workload-evidence",
  architecture,
  components: architecture.components,
  simulation: readAsideSim,
  redirectRps:
    urlShortenerChallenge.workload.requestsPerSecond * urlShortenerChallenge.workload.readRatio,
};

const totalEvents = readAsideSim.events.length;
const midTick = Math.floor(totalEvents * 0.6);
const cacheVisual = buildComponentPlaybackVisuals(playbackContext, midTick, totalEvents).find(
  (visual) => visual.componentId === "redis1",
);
const serviceVisual = buildComponentPlaybackVisuals(playbackContext, midTick, totalEvents).find(
  (visual) => visual.componentId === "svc1",
);

assert.ok(cacheVisual, "cache playback visual exists");
assert.ok(serviceVisual, "service playback visual exists");
assert.ok(
  Array.isArray(cacheVisual.processingSlotIndices) && cacheVisual.processingSlotIndices.length > 0,
  "active cache should light randomized cube cells",
);
assert.equal(serviceVisual.processingSlotIndices, undefined, "servers fill bays sequentially, not random slots");
assert.ok(serviceVisual.processingCount > 0, "active service should show sequential bay fill");

const replay = buildComponentPlaybackVisuals(playbackContext, midTick, totalEvents).find(
  (visual) => visual.componentId === "redis1",
);
assert.deepEqual(replay.processingSlotIndices, cacheVisual.processingSlotIndices, "same tick replays same slots");

const nextTick = buildComponentPlaybackVisuals(playbackContext, midTick + 1, totalEvents).find(
  (visual) => visual.componentId === "redis1",
);
if (cacheVisual.processingSlotIndices.length > 1) {
  assert.notDeepEqual(
    nextTick.processingSlotIndices,
    cacheVisual.processingSlotIndices,
    "advancing playback should vary cosmetic cache placement",
  );
}

console.log("Check — impact slots are deterministic and bounded");
const impactSeed = impactSlotSeed({
  runId: "baseline-001",
  componentId: "redis-primary",
  sequence: 4,
});
const impactSlots = randomizedImpactSlots(8, impactSeed);
assert.deepEqual(randomizedImpactSlots(8, impactSeed), impactSlots, "the same event must replay identically");
assert.deepEqual([...impactSlots].sort((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6, 7]);
assert.notDeepEqual(
  randomizedImpactSlots(
    8,
    impactSlotSeed({ runId: "baseline-001", componentId: "redis-primary", sequence: 5 }),
  ),
  impactSlots,
  "separate events should vary cosmetic impact placement",
);
assert.deepEqual(randomizedImpactSlots(0, impactSeed), []);
assert.throws(() => randomizedImpactSlots(-1, impactSeed), /non-negative safe integer/);

console.log("workload evidence verified");
