/**
 * LP-05 — canvas busyness follows global redirect share, not local utilization.
 *
 * Usage: pnpm --filter @faultline/web verify:volume-share-visuals
 */
import assert from "node:assert/strict";

import { getLevelCurriculum, urlShortenerChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "@faultline/simulator";

import { buildComponentPlaybackVisuals } from "../features/traffic-playback/playback-component-visuals.ts";
import {
  buildComponentVolumeShares,
  mechanismCellsFromShare,
  VOLUME_SHARE_IDLE_EPSILON,
} from "../features/traffic-playback/volume-share-visuals.ts";
import { deriveGlyphMechanismValues } from "../features/playground-glyphs/state.ts";

const redirectRps =
  urlShortenerChallenge.workload.requestsPerSecond * urlShortenerChallenge.workload.readRatio;

const traffic = {
  id: "t1",
  type: "traffic-source",
  config: { label: "Incoming traffic" },
  deployments: [],
  ui: { x: 0, y: 0 },
};

function service(id, instances = 6) {
  return {
    id,
    type: "service",
    config: { size: "large", instances },
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

function postgres(id) {
  return {
    id,
    type: "postgres",
    config: { tier: "large", readReplicaCount: 2 },
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

function redis(id) {
  return {
    id,
    type: "redis",
    config: { mode: "standalone", tier: "large", ttlBand: "long" },
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

function cdn(id) {
  return {
    id,
    type: "cdn",
    config: { coverage: 1, ttlBand: "long", tier: "large" },
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

function lb(id) {
  return { id, type: "load-balancer", config: { policy: "equal" }, deployments: [], ui: { x: 0, y: 0 } };
}

function req(id, source, target, sourcePort = "request_out", targetPort = "request_in") {
  return {
    id,
    sourceComponentId: source,
    sourcePortId: sourcePort,
    targetComponentId: target,
    targetPortId: targetPort,
    type: "request",
  };
}

function db(id, source, target, sourcePort, targetPort) {
  return {
    id,
    sourceComponentId: source,
    sourcePortId: sourcePort,
    targetComponentId: target,
    targetPortId: targetPort,
    type: "read_write",
  };
}

/** A: CDN on path + Redis read-aside — CDN should outrank Redis on average absorb. */
function architectureWithCdnAndRedis() {
  return {
    version: 1,
    components: [
      traffic,
      cdn("cdn1"),
      lb("lb1"),
      service("svc1"),
      service("svc2"),
      redis("redis1"),
      postgres("pg1"),
    ],
    connections: [
      req("e1", "t1", "cdn1"),
      req("e2", "cdn1", "lb1", "origin_out", "request_in"),
      req("e3", "lb1", "svc1"),
      req("e4", "lb1", "svc2"),
      db("e5", "svc1", "redis1", "database_out", "cache_in"),
      db("e6", "svc2", "redis1", "database_out", "cache_in"),
      db("e7", "redis1", "pg1", "origin_out", "database_in"),
      db("e8", "svc1", "pg1", "database_out", "database_in"),
      db("e9", "svc2", "pg1", "database_out", "database_in"),
    ],
  };
}

/** B: Redis dials present but idle / off-path. */
function architectureIdleRedis() {
  return {
    version: 1,
    components: [
      traffic,
      cdn("cdn1"),
      lb("lb1"),
      service("svc1"),
      redis("redis1"),
      postgres("pg1"),
    ],
    connections: [
      req("e1", "t1", "cdn1"),
      req("e2", "cdn1", "lb1", "origin_out", "request_in"),
      req("e3", "lb1", "svc1"),
      db("e4", "svc1", "pg1", "database_out", "database_in"),
    ],
  };
}

const curriculum = getLevelCurriculum("url-shortener");
assert.equal(curriculum.volumeProfile.rules.baselineCdnOutranksDataCache, true);

console.log("Check — A: CDN share > Redis share; redis cells < cdn cells");
const archA = architectureWithCdnAndRedis();
const simA = evaluateRequirements({
  architecture: archA,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(simA.valid, true);

const sharesA = buildComponentVolumeShares({
  redirectRps,
  simulation: simA,
  volumeProfile: curriculum.volumeProfile,
});
const cdnShare = sharesA.get("cdn1");
const redisShare = sharesA.get("redis1");
assert.ok(cdnShare, "cdn share expected");
assert.ok(redisShare, "redis share expected");
assert.ok(
  cdnShare.share01 > redisShare.share01,
  `CDN share (${cdnShare.share01}) should exceed Redis (${redisShare.share01})`,
);

const cdnCells = mechanismCellsFromShare(cdnShare.share01, 16, cdnShare.saturated);
const redisCells = mechanismCellsFromShare(redisShare.share01, 16, redisShare.saturated);
assert.ok(redisCells < cdnCells, `redis cells (${redisCells}) < cdn cells (${cdnCells})`);

const playbackA = buildComponentPlaybackVisuals(
  {
    runId: "volume-a",
    architecture: archA,
    components: archA.components,
    simulation: simA,
    redirectRps,
  },
  1,
  1,
);
const redisVisual = playbackA.find((visual) => visual.componentId === "redis1");
const cdnVisual = playbackA.find((visual) => visual.componentId === "cdn1");
assert.ok(redisVisual && cdnVisual);
assert.ok(
  (redisVisual.processingCount ?? 0) < (cdnVisual.passCount ?? 0),
  "settled playback: redis cubes quieter than CDN passes",
);

const glyphRedis = deriveGlyphMechanismValues("redis1", simA, { redirectRps });
const glyphCdn = deriveGlyphMechanismValues("cdn1", simA, { redirectRps });
assert.ok((glyphRedis.processingCount ?? 0) < (glyphCdn.passCount ?? 0));

console.log("Check — B: idle Redis share ≈ 0 → cells 0");
const archB = architectureIdleRedis();
const simB = evaluateRequirements({
  architecture: archB,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(simB.valid, true);
assert.equal(simB.caches["redis1"], undefined);

const sharesB = buildComponentVolumeShares({
  redirectRps,
  simulation: simB,
  volumeProfile: curriculum.volumeProfile,
});
assert.equal(sharesB.get("redis1"), undefined);

const idleGlyph = deriveGlyphMechanismValues("redis1", simB, { redirectRps });
assert.deepEqual(idleGlyph, {});

assert.equal(mechanismCellsFromShare(0, 16, false), 0);
assert.equal(mechanismCellsFromShare(VOLUME_SHARE_IDLE_EPSILON, 16, false), 0);
assert.ok(mechanismCellsFromShare(0.2, 16, false) > 0);
assert.equal(mechanismCellsFromShare(0.2, 16, true), 16, "saturation still fills all slots");

console.log("volume share visuals verified");
