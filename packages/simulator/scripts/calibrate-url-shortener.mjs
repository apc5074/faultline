/**
 * Lightweight CHAL-001 calibration fixtures (not a formal regression suite).
 * Prints outcome metrics for underprovisioned, cache-heavy, CDN-heavy, replica-heavy,
 * and over-budget architectures. Asserts at least two materially different passers.
 */
import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { urlShortenerChallenge } from "@faultline/challenges";
import { evaluateRequirements } from "../dist/index.js";

const challenge = urlShortenerChallenge;
const registry = componentRegistry;

const traffic = {
  id: "traffic-01",
  type: "traffic-source",
  config: { label: "Incoming traffic" },
  deployments: [],
  ui: { x: 0, y: 0 },
};

function service(id, size, instances, x) {
  return { id, type: "service", config: { size, instances }, deployments: [], ui: { x, y: 0 } };
}

function postgres(id, tier, readReplicaCount, x) {
  return { id, type: "postgres", config: { tier, readReplicaCount }, deployments: [], ui: { x, y: 0 } };
}

function redis(id, mode, tier, ttlBand, x) {
  return { id, type: "redis", config: { mode, tier, ttlBand }, deployments: [], ui: { x, y: 0 } };
}

function cdn(id, coverage, ttlBand, tier, x) {
  return { id, type: "cdn", config: { coverage, ttlBand, tier }, deployments: [], ui: { x, y: 0 } };
}

function lb(id, policy, x) {
  return { id, type: "load-balancer", config: { policy }, deployments: [], ui: { x, y: 0 } };
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

function summarize(label, result) {
  assert.equal(result.valid, true, `${label} should be a valid architecture`);
  if (!result.valid) throw new Error(label);
  const redisCache = Object.entries(result.caches).find(([id]) => id.startsWith("redis"));
  const cdnCache = Object.entries(result.caches).find(([id]) => id.startsWith("cdn"));
  const pg = Object.values(result.postgres)[0];
  console.log(`\n=== ${label} ===`);
  console.log({
    allRequirementsPass: result.allRequirementsPass,
    throughputRatio: result.throughputRatio,
    p95LatencyMs: result.p95LatencyMs,
    headroom: result.headroom,
    monthlyCost: result.cost.monthlyTotal,
    redisHitRate: redisCache ? redisCache[1].hitRate : null,
    cdnHitRate: cdnCache ? cdnCache[1].hitRate : null,
    postgresReadUtilization: pg?.readUtilization ?? null,
    postgresWriteUtilization: pg?.writeUtilization ?? null,
    hotKeyPassed: result.hotKey.passed,
    hotKeyViralRps: result.hotKey.viralRedirectRps,
    requirements: result.requirements.map((requirement) => ({
      id: requirement.id,
      passed: requirement.passed,
      actual: requirement.actual,
    })),
  });
  return result;
}

const underprovisioned = summarize(
  "underprovisioned",
  evaluateRequirements({
    architecture: {
      version: 1,
      components: [traffic, service("service-01", "small", 2, 300), postgres("postgres-01", "small", 0, 600)],
      connections: [
        req("t-s", "traffic-01", "service-01"),
        db("s-p", "service-01", "postgres-01", "database_out", "database_in"),
      ],
    },
    challenge,
    registry,
  }),
);
assert.equal(underprovisioned.allRequirementsPass, false);

const cacheHeavy = summarize(
  "cache-heavy (CDN + Redis layered)",
  evaluateRequirements({
    architecture: {
      version: 1,
      components: [
        traffic,
        cdn("cdn-01", 1, "long", "large", 120),
        service("service-01", "large", 8, 350),
        redis("redis-01", "standalone", "large", "long", 550),
        postgres("postgres-01", "large", 1, 800),
      ],
      connections: [
        req("t-c", "traffic-01", "cdn-01"),
        req("c-s", "cdn-01", "service-01", "origin_out", "request_in"),
        db("s-r", "service-01", "redis-01", "database_out", "cache_in"),
        db("r-p", "redis-01", "postgres-01", "origin_out", "database_in"),
      ],
    },
    challenge,
    registry,
  }),
);

const cdnHeavy = summarize(
  "cdn-heavy",
  evaluateRequirements({
    architecture: {
      version: 1,
      components: [
        traffic,
        cdn("cdn-01", 1, "long", "large", 150),
        service("service-01", "large", 8, 400),
        postgres("postgres-01", "large", 2, 700),
      ],
      connections: [
        req("t-c", "traffic-01", "cdn-01"),
        req("c-s", "cdn-01", "service-01", "origin_out", "request_in"),
        db("s-p", "service-01", "postgres-01", "database_out", "database_in"),
      ],
    },
    challenge,
    registry,
  }),
);

const replicaHeavy = summarize(
  "replica-heavy (no cache)",
  evaluateRequirements({
    architecture: {
      version: 1,
      components: [
        traffic,
        lb("lb-01", "equal", 150),
        service("service-01", "large", 10, 300),
        service("service-02", "large", 10, 300),
        service("service-03", "large", 10, 300),
        service("service-04", "large", 10, 300),
        postgres("postgres-01", "large", 8, 700),
      ],
      connections: [
        req("t-lb", "traffic-01", "lb-01"),
        req("lb-s1", "lb-01", "service-01"),
        req("lb-s2", "lb-01", "service-02"),
        req("lb-s3", "lb-01", "service-03"),
        req("lb-s4", "lb-01", "service-04"),
        db("s1-p", "service-01", "postgres-01", "database_out", "database_in"),
        db("s2-p", "service-02", "postgres-01", "database_out", "database_in"),
        db("s3-p", "service-03", "postgres-01", "database_out", "database_in"),
        db("s4-p", "service-04", "postgres-01", "database_out", "database_in"),
      ],
    },
    challenge,
    registry,
  }),
);
assert.equal(replicaHeavy.hotKey.passed, false, "replicas alone must not solve the viral key");

const overBudget = summarize(
  "over-budget",
  evaluateRequirements({
    architecture: {
      version: 1,
      components: [
        traffic,
        cdn("cdn-01", 1, "long", "large", 120),
        lb("lb-01", "capacity_weighted", 220),
        service("service-01", "large", 10, 350),
        service("service-02", "large", 10, 350),
        service("service-03", "large", 10, 350),
        service("service-04", "large", 10, 350),
        redis("redis-01", "replicated", "large", "long", 550),
        postgres("postgres-01", "large", 8, 800),
      ],
      connections: [
        req("t-c", "traffic-01", "cdn-01"),
        req("c-lb", "cdn-01", "lb-01", "origin_out", "request_in"),
        req("lb-s1", "lb-01", "service-01"),
        req("lb-s2", "lb-01", "service-02"),
        req("lb-s3", "lb-01", "service-03"),
        req("lb-s4", "lb-01", "service-04"),
        db("s1-r", "service-01", "redis-01", "database_out", "cache_in"),
        db("s2-r", "service-02", "redis-01", "database_out", "cache_in"),
        db("s3-r", "service-03", "redis-01", "database_out", "cache_in"),
        db("s4-r", "service-04", "redis-01", "database_out", "cache_in"),
        db("r-p", "redis-01", "postgres-01", "origin_out", "database_in"),
      ],
    },
    challenge,
    registry,
  }),
);

const passers = [
  ["cache-heavy", cacheHeavy],
  ["cdn-heavy", cdnHeavy],
].filter(([, result]) => result.allRequirementsPass);

console.log(`\nPassers: ${passers.map(([name]) => name).join(", ") || "(none)"}`);
assert.ok(passers.length >= 2, `expected at least two passing architecture classes, got ${passers.length}`);
assert.equal(underprovisioned.allRequirementsPass, false);
assert.ok(overBudget.cost.monthlyTotal > challenge.monthlyBudget || overBudget.allRequirementsPass === false);

console.log("\nurl-shortener calibration fixtures ok");
