import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import {
  evaluateHotKeyScenario,
  evaluateRequirements,
  viralRedirectRpsForChallenge,
} from "../dist/index.js";

const hotKeyChallenge = {
  ...tinyApiChallenge,
  title: "Hot-key fixture",
  workload: {
    requestsPerSecond: 120_000,
    readRatio: 1,
    writeRatio: 0,
    hotKeyReadFraction: 0.25,
  },
  allowedComponentTypes: [
    ...tinyApiChallenge.allowedComponentTypes,
    "redis",
    "cdn",
    "load-balancer",
    "global-router",
  ],
  monthlyBudget: 100_000,
  requirements: tinyApiChallenge.requirements.map((requirement) =>
    requirement.type === "budget"
      ? { ...requirement, target: 100_000 }
      : requirement.type === "throughput"
        ? { ...requirement, target: 1 }
        : requirement,
  ),
};

assert.equal(viralRedirectRpsForChallenge(hotKeyChallenge), 30_000);
assert.equal(viralRedirectRpsForChallenge(tinyApiChallenge), 0);

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
  config: { tier: "medium", readReplicaCount: 8 },
  deployments: [],
  ui: { x: 900, y: 0 },
};
const redis = {
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

// Tiny API: hot-key inactive and does not affect pass/fail.
const tiny = evaluateRequirements({
  architecture: {
    version: 1,
    components: [
      traffic,
      { ...service, config: { size: "medium", instances: 4 } },
      { ...postgres, config: { tier: "medium" } },
    ],
    connections: [
      requestEdge("traffic-service", "traffic-01", "service-01"),
      databaseEdge("service-postgres", "service-01", "postgres-01", "database_out", "database_in"),
    ],
  },
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
assert.equal(tiny.valid, true);
if (!tiny.valid) throw new Error("Expected tiny architecture.");
assert.equal(tiny.hotKey.active, false);
assert.equal(tiny.hotKey.passed, true);
assert.equal(tiny.allRequirementsPass, true);

// No cache: 30k viral hits Postgres primary; replicas do not absorb the hot key.
const direct = evaluateHotKeyScenario({
  architecture: {
    version: 1,
    components: [traffic, service, postgres],
    connections: [
      requestEdge("traffic-service", "traffic-01", "service-01"),
      databaseEdge("service-postgres", "service-01", "postgres-01", "database_out", "database_in"),
    ],
  },
  challenge: hotKeyChallenge,
  registry: componentRegistry,
});
assert.equal(direct.valid, true);
if (!direct.valid) throw new Error("Expected direct hot-key result.");
assert.equal(direct.hotKey.active, true);
assert.equal(direct.hotKey.viralRedirectRps, 30_000);
assert.equal(direct.hotKey.viralReachingPostgresRps, 30_000);
assert.equal(direct.hotKey.passed, false);
assert.ok(direct.hotKey.saturatedComponentIds.includes("postgres-01"));
assert.ok(direct.hotKey.explanation.includes("Hot-key scenario failed"));

// Medium Redis cannot hide 30k behind aggregate headroom (hot-key cap 12k).
const withRedis = evaluateHotKeyScenario({
  architecture: {
    version: 1,
    components: [traffic, service, redis, postgres],
    connections: [
      requestEdge("traffic-service", "traffic-01", "service-01"),
      databaseEdge("service-redis", "service-01", "redis-01", "database_out", "cache_in"),
      databaseEdge("redis-postgres", "redis-01", "postgres-01", "origin_out", "database_in"),
    ],
  },
  challenge: hotKeyChallenge,
  registry: componentRegistry,
});
assert.equal(withRedis.valid, true);
if (!withRedis.valid) throw new Error("Expected redis hot-key result.");
assert.equal(withRedis.hotKey.viralRedirectRps, 30_000);
const redisHop = withRedis.hotKey.hops.find((hop) => hop.componentId === "redis-01");
assert.ok(redisHop);
assert.equal(redisHop.incomingViralRps, 30_000);
assert.equal(redisHop.hotKeyCapacityRps, 12_000);
assert.equal(redisHop.saturated, true);
assert.equal(redisHop.absorbedViralRps, 12_000 * 0.75);
assert.equal(withRedis.hotKey.viralReachingPostgresRps, 30_000 - 12_000 * 0.75);
assert.equal(withRedis.hotKey.passed, false);
assert.ok(withRedis.hotKey.viralReachingPostgresRps < direct.hotKey.viralReachingPostgresRps);

// Large Redis + long TTL can absorb the viral key without Postgres pressure.
const strongCache = evaluateHotKeyScenario({
  architecture: {
    version: 1,
    components: [traffic, service, redisLarge, postgres],
    connections: [
      requestEdge("traffic-service", "traffic-01", "service-01"),
      databaseEdge("service-redis", "service-01", "redis-01", "database_out", "cache_in"),
      databaseEdge("redis-postgres", "redis-01", "postgres-01", "origin_out", "database_in"),
    ],
  },
  challenge: hotKeyChallenge,
  registry: componentRegistry,
});
assert.equal(strongCache.valid, true);
if (!strongCache.valid) throw new Error("Expected strong-cache hot-key result.");
assert.equal(strongCache.hotKey.passed, true);
assert.equal(strongCache.hotKey.saturatedComponentIds.length, 0);
assert.equal(strongCache.hotKey.viralReachingPostgresRps, 30_000 * (1 - 0.88));
assert.ok(strongCache.hotKey.viralReachingPostgresRps < 10_000);

// CDN in front of service absorbs viral redirects before origin.
const withCdn = evaluateHotKeyScenario({
  architecture: {
    version: 1,
    components: [traffic, cdn, service, postgres],
    connections: [
      requestEdge("traffic-cdn", "traffic-01", "cdn-01"),
      requestEdge("cdn-service", "cdn-01", "service-01", "origin_out", "request_in"),
      databaseEdge("service-postgres", "service-01", "postgres-01", "database_out", "database_in"),
    ],
  },
  challenge: hotKeyChallenge,
  registry: componentRegistry,
});
assert.equal(withCdn.valid, true);
if (!withCdn.valid) throw new Error("Expected CDN hot-key result.");
const cdnHop = withCdn.hotKey.hops.find((hop) => hop.componentId === "cdn-01");
assert.ok(cdnHop);
assert.equal(cdnHop.incomingViralRps, 30_000);
assert.equal(cdnHop.absorbedViralRps, 30_000 * 0.88);
assert.equal(withCdn.hotKey.viralReachingPostgresRps, 30_000 * 0.12);
assert.equal(withCdn.hotKey.passed, true);

// Requirements fail overall when hot-key fails even if other requirements would pass.
const failingRequirements = evaluateRequirements({
  architecture: {
    version: 1,
    components: [traffic, service, postgres],
    connections: [
      requestEdge("traffic-service", "traffic-01", "service-01"),
      databaseEdge("service-postgres", "service-01", "postgres-01", "database_out", "database_in"),
    ],
  },
  challenge: hotKeyChallenge,
  registry: componentRegistry,
});
assert.equal(failingRequirements.valid, true);
if (!failingRequirements.valid) throw new Error("Expected requirements result.");
assert.equal(failingRequirements.hotKey.passed, false);
assert.equal(failingRequirements.allRequirementsPass, false);
assert.ok(
  failingRequirements.events.some(
    (event) => event.type === "requirement_failed" && event.data.requirementId === "hot-key",
  ),
);

console.log("hot-key scenario verified");
