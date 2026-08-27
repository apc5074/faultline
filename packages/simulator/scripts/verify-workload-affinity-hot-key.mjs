import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { urlShortenerChallenge } from "@faultline/challenges";
import {
  evaluateHotKeyScenario,
  hotKeyViralRedirectRpsWithReuseConcentration,
  viralRedirectRpsForChallenge,
} from "../dist/index.js";

const { workloadAffinity: _legacyHotKeyAffinity, ...urlShortenerWithoutAffinity } = urlShortenerChallenge;
const hotKeyChallenge = {
  ...urlShortenerWithoutAffinity,
  workload: {
    requestsPerSecond: 120_000,
    readRatio: 1,
    writeRatio: 0,
    hotKeyReadFraction: 0.25,
  },
};

const traffic = {
  id: "traffic-01",
  type: "traffic-source",
  config: { label: "Incoming traffic" },
  deployments: [],
  ui: { x: 0, y: 0 },
};
const service = {
  id: "service-01",
  type: "service",
  config: { size: "large", instances: 10 },
  deployments: [],
  ui: { x: 300, y: 0 },
};
const postgres = {
  id: "postgres-01",
  type: "postgres",
  config: { tier: "large", readReplicaCount: 1 },
  deployments: [],
  ui: { x: 900, y: 0 },
};
const redisMedium = {
  id: "redis-01",
  type: "redis",
  config: { mode: "standalone", tier: "medium", ttlBand: "medium" },
  deployments: [],
  ui: { x: 600, y: 0 },
};
const redisLarge = {
  id: "redis-01",
  type: "redis",
  config: { mode: "standalone", tier: "large", ttlBand: "long" },
  deployments: [],
  ui: { x: 600, y: 0 },
};
const cdn = {
  id: "cdn-01",
  type: "cdn",
  config: { coverage: 1, ttlBand: "long", tier: "large" },
  deployments: [],
  ui: { x: 150, y: 0 },
};

const requestEdge = (id, source, target, sourcePort = "request_out", targetPort = "request_in") => ({
  id,
  sourceComponentId: source,
  sourcePortId: sourcePort,
  targetComponentId: target,
  targetPortId: targetPort,
  type: "request",
});

const databaseEdge = (id, source, target, sourcePort, targetPort) => ({
  id,
  sourceComponentId: source,
  sourcePortId: sourcePort,
  targetComponentId: target,
  targetPortId: targetPort,
  type: "read_write",
});

function readAsideArchitecture(redis = redisLarge) {
  return {
    version: 1,
    components: [traffic, service, redis, postgres],
    connections: [
      requestEdge("traffic-service", "traffic-01", "service-01"),
      databaseEdge("service-redis", "service-01", "redis-01", "database_out", "cache_in"),
      databaseEdge("redis-postgres", "redis-01", "postgres-01", "origin_out", "database_in"),
    ],
  };
}

function misplacedArchitecture() {
  return {
    version: 1,
    components: [traffic, service, redisMedium, { ...redisMedium, id: "redis-02" }],
    connections: [
      requestEdge("traffic-service", "traffic-01", "service-01"),
      databaseEdge("service-redis", "service-01", "redis-01", "database_out", "cache_in"),
      databaseEdge("redis-dead", "redis-01", "redis-02", "origin_out", "cache_in"),
    ],
  };
}

function cdnArchitecture() {
  return {
    version: 1,
    components: [traffic, cdn, service, postgres],
    connections: [
      requestEdge("traffic-cdn", "traffic-01", "cdn-01"),
      requestEdge("cdn-service", "cdn-01", "service-01", "origin_out", "request_in"),
      databaseEdge("service-postgres", "service-01", "postgres-01", "database_out", "database_in"),
    ],
  };
}

function runHotKey(architecture, challenge) {
  const result = evaluateHotKeyScenario({ architecture, challenge, registry: componentRegistry });
  assert.equal(result.valid, true, JSON.stringify(result.valid === false ? result.errors : null));
  if (!result.valid) throw new Error("invalid architecture");
  return result.hotKey;
}

const baseViral = viralRedirectRpsForChallenge(hotKeyChallenge);
assert.equal(baseViral, 30_000);
assert.equal(hotKeyViralRedirectRpsWithReuseConcentration(hotKeyChallenge, baseViral), baseViral);

// No affinity + good read-aside placement: hot-key matches legacy absorb (large Redis long TTL).
{
  const hotKey = runHotKey(readAsideArchitecture(), hotKeyChallenge);
  assert.equal(hotKey.viralRedirectRps, 30_000);
  const redisHop = hotKey.hops.find((hop) => hop.componentId === "redis-01");
  assert.ok(redisHop);
  assert.equal(redisHop.incomingViralRps, 30_000);
  assert.equal(redisHop.absorbedViralRps, 30_000 * 0.88);
  assert.equal(hotKey.passed, true);
}

// Misplaced Redis does not magically absorb hot-key traffic like read-aside.
{
  const readAside = runHotKey(readAsideArchitecture(redisMedium), hotKeyChallenge);
  const misplaced = runHotKey(misplacedArchitecture(), hotKeyChallenge);
  const readAsideHop = readAside.hops.find((hop) => hop.componentId === "redis-01");
  const misplacedHop = misplaced.hops.find((hop) => hop.componentId === "redis-01");
  assert.ok(readAsideHop && misplacedHop);
  assert.ok(readAsideHop.absorbedViralRps > misplacedHop.absorbedViralRps);
}

// URL-shortener-like affinity: read-aside Redis helps; CDN edge still absorbs more on average redirects.
{
  const affinityChallenge = {
    ...hotKeyChallenge,
    workloadAffinity: {
      roleDefaults: { unreachable: 0, misplaced: 0.05 },
      mechanisms: {
        edge_cache: { maxEffectiveness: 0.85, byRole: { edge_ingress: 1.0 }, reuseConcentration: 0.7 },
        data_cache: { maxEffectiveness: 0.3, byRole: { read_aside: 1.0 }, reuseConcentration: 0.8 },
      },
    },
  };

  assert.equal(hotKeyViralRedirectRpsWithReuseConcentration(affinityChallenge, baseViral), baseViral * 0.8);
  const withRedis = runHotKey(readAsideArchitecture(redisLarge), affinityChallenge);
  const withCdn = runHotKey(cdnArchitecture(), affinityChallenge);
  const redisHop = withRedis.hops.find((hop) => hop.componentId === "redis-01");
  const cdnHop = withCdn.hops.find((hop) => hop.componentId === "cdn-01");
  assert.ok(redisHop && cdnHop);
  assert.ok(cdnHop.absorbedViralRps > redisHop.absorbedViralRps);
  assert.ok(withRedis.viralRedirectRps < baseViral);
}

console.log("workload affinity hot-key parity verified");
