import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { urlShortenerChallenge } from "@faultline/challenges";
import { propagateTraffic } from "../dist/index.js";

function component(id, type, config, extra = {}) {
  return { id, type, config, deployments: [], ui: { x: 0, y: 0 }, ...extra };
}

function edge(id, sourceComponentId, sourcePortId, targetComponentId, targetPortId, type) {
  return { id, sourceComponentId, sourcePortId, targetComponentId, targetPortId, type };
}

const trafficSourceConfig = { label: "Incoming traffic" };
const redisConfig = { mode: "standalone", tier: "medium", ttlBand: "medium" };
const serviceConfig = { size: "medium", instances: 4 };
const postgresConfig = { tier: "medium" };

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

function run(architecture, challenge) {
  const result = propagateTraffic({ architecture, challenge, registry: componentRegistry });
  assert.equal(result.valid, true, JSON.stringify(result.valid === false ? result.errors : null));
  if (!result.valid) throw new Error("unreachable");
  return result;
}

// (a) identical Redis dials; read-aside vs misplaced on url-shortener authored affinity.
{
  assert.ok(urlShortenerChallenge.workloadAffinity);
  const readAside = run(readAsideArchitecture(), urlShortenerChallenge);
  const misplaced = run(misplacedArchitecture(), urlShortenerChallenge);
  const readAsideCache = readAside.caches["redis1"];
  const misplacedCache = misplaced.caches["redis1"];

  assert.equal(readAsideCache.role, "read_aside");
  assert.equal(misplacedCache.role, "misplaced");
  assert.ok(Math.abs(readAsideCache.challengeCeiling - 0.3) < 1e-9);
  assert.ok(Math.abs(misplacedCache.challengeCeiling - 0.015) < 1e-9);
  assert.notEqual(readAsideCache.hitRps, misplacedCache.hitRps);
  assert.ok(readAsideCache.hitRps > misplacedCache.hitRps);
}

// (b) same placement (read-aside), authored ceiling vs lower override on url-shortener.
{
  const architecture = readAsideArchitecture();
  const fullCeilingChallenge = urlShortenerChallenge;
  const lowCeilingChallenge = {
    ...urlShortenerChallenge,
    workloadAffinity: {
      ...urlShortenerChallenge.workloadAffinity,
      mechanisms: {
        ...urlShortenerChallenge.workloadAffinity?.mechanisms,
        data_cache: { maxEffectiveness: 0.15, byRole: { read_aside: 1.0 }, reuseConcentration: 0.8 },
      },
    },
  };

  const fullCeiling = run(architecture, fullCeilingChallenge);
  const lowCeiling = run(architecture, lowCeilingChallenge);
  const fullCache = fullCeiling.caches["redis1"];
  const lowCache = lowCeiling.caches["redis1"];

  assert.equal(fullCache.role, "read_aside");
  assert.equal(lowCache.role, "read_aside");
  assert.ok(Math.abs(fullCache.challengeCeiling - 0.3) < 1e-9);
  assert.ok(Math.abs(lowCache.challengeCeiling - 0.15) < 1e-9);
  assert.notEqual(fullCache.hitRps, lowCache.hitRps);
  assert.ok(fullCache.hitRps > lowCache.hitRps);
}

// Authored url-shortener affinity scales configured hit rate on read-aside placement.
{
  const result = run(readAsideArchitecture(), urlShortenerChallenge);
  const cache = result.caches["redis1"];
  assert.ok(cache.effectiveConfiguredHitRate < cache.playerIntent);
  assert.ok(Math.abs(cache.effectiveConfiguredHitRate - cache.challengeCeiling * cache.playerIntent) < 1e-9);
}

console.log("workload affinity cache wiring verified");
