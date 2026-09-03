/**
 * Live Phase 4 competition verification against a running Next.js server + Supabase.
 *
 * Usage (repo root, after migrations + seed):
 *   BASE_URL=http://127.0.0.1:3000 node apps/web/scripts/verify-phase-4-live.mjs
 *
 * Covers Verifications 6–18, 20–25 (API/DB). Browser-only / production-URL checks
 * (2–5, 23 UI, 26) remain a short manual pass on the deployed URL.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { evaluateRequirements, SIMULATOR_VERSION } from "@faultline/simulator";
import { componentRegistry } from "@faultline/component-catalog";
import { hashArchitecture, urlShortenerChallenge } from "@faultline/challenges";

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

const cwd = process.cwd();
loadEnvFile(resolve(cwd, ".env"));
loadEnvFile(resolve(cwd, "../../.env"));
loadEnvFile(resolve(cwd, "../.env"));

const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

const traffic = {
  id: "traffic-01",
  type: "traffic-source",
  config: { label: "Incoming traffic" },
  deployments: [],
  ui: { x: 0, y: 0 },
};

function C(type, id, config, x) {
  return { id, type, config, deployments: [], ui: { x, y: 0 } };
}
function req(id, s, t, sp = "request_out", tp = "request_in") {
  return {
    id,
    sourceComponentId: s,
    sourcePortId: sp,
    targetComponentId: t,
    targetPortId: tp,
    type: "request",
  };
}
function db(id, s, t, sp, tp) {
  return {
    id,
    sourceComponentId: s,
    sourcePortId: sp,
    targetComponentId: t,
    targetPortId: tp,
    type: "read_write",
  };
}

const underprovisioned = {
  version: 1,
  components: [
    traffic,
    C("service", "service-01", { size: "small", instances: 2 }, 300),
    C("postgres", "postgres-01", { tier: "small", readReplicaCount: 0 }, 600),
  ],
  connections: [
    req("t-s", "traffic-01", "service-01"),
    db("s-p", "service-01", "postgres-01", "database_out", "database_in"),
  ],
};

const overBudget = {
  version: 1,
  components: [
    traffic,
    C("cdn", "cdn-01", { coverage: 1, ttlBand: "long", tier: "large" }, 120),
    C("load-balancer", "lb-01", { policy: "capacity_weighted" }, 220),
    C("service", "service-01", { size: "large", instances: 10 }, 350),
    C("service", "service-02", { size: "large", instances: 10 }, 350),
    C("service", "service-03", { size: "large", instances: 10 }, 350),
    C("service", "service-04", { size: "large", instances: 10 }, 350),
    C("redis", "redis-01", { mode: "replicated", tier: "large", ttlBand: "long" }, 550),
    C("postgres", "postgres-01", { tier: "large", readReplicaCount: 8 }, 800),
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
};

const cacheHeavy = {
  version: 1,
  components: [
    traffic,
    C("cdn", "cdn-01", { coverage: 1, ttlBand: "long", tier: "large" }, 120),
    C("load-balancer", "lb-01", { policy: "equal" }, 220),
    C("service", "service-01", { size: "large", instances: 6 }, 350),
    C("service", "service-02", { size: "large", instances: 6 }, 350),
    C("redis", "redis-01", { mode: "standalone", tier: "large", ttlBand: "long" }, 550),
    C("postgres", "postgres-01", { tier: "large", readReplicaCount: 2 }, 800),
  ],
  connections: [
    req("t-c", "traffic-01", "cdn-01"),
    req("c-l", "cdn-01", "lb-01", "origin_out", "request_in"),
    req("lb-s1", "lb-01", "service-01"),
    req("lb-s2", "lb-01", "service-02"),
    db("s1-r", "service-01", "redis-01", "database_out", "cache_in"),
    db("s2-r", "service-02", "redis-01", "database_out", "cache_in"),
    db("r-p", "redis-01", "postgres-01", "origin_out", "database_in"),
    db("s1-p", "service-01", "postgres-01", "database_out", "database_in"),
    db("s2-p", "service-02", "postgres-01", "database_out", "database_in"),
  ],
};

const cdnHeavy = {
  version: 1,
  components: [
    traffic,
    C("cdn", "cdn-01", { coverage: 1, ttlBand: "long", tier: "large" }, 150),
    C("load-balancer", "lb-01", { policy: "equal" }, 220),
    C("service", "service-01", { size: "large", instances: 6 }, 300),
    C("service", "service-02", { size: "large", instances: 6 }, 300),
    C("postgres", "postgres-01", { tier: "large", readReplicaCount: 2 }, 700),
  ],
  connections: [
    req("t-c", "traffic-01", "cdn-01"),
    req("c-l", "cdn-01", "lb-01", "origin_out", "request_in"),
    req("lb-s1", "lb-01", "service-01"),
    req("lb-s2", "lb-01", "service-02"),
    db("s1-p", "service-01", "postgres-01", "database_out", "database_in"),
    db("s2-p", "service-02", "postgres-01", "database_out", "database_in"),
  ],
};

const expensiveEligible = {
  version: 1,
  components: [
    traffic,
    C("cdn", "cdn-01", { coverage: 1, ttlBand: "long", tier: "large" }, 120),
    C("service", "service-01", { size: "large", instances: 8 }, 350),
    C("redis", "redis-01", { mode: "replicated", tier: "large", ttlBand: "long" }, 550),
    C("postgres", "postgres-01", { tier: "large", readReplicaCount: 4 }, 800),
  ],
  connections: [
    req("t-c", "traffic-01", "cdn-01"),
    req("c-s", "cdn-01", "service-01", "origin_out", "request_in"),
    db("s-r", "service-01", "redis-01", "database_out", "cache_in"),
    db("r-p", "redis-01", "postgres-01", "origin_out", "database_in"),
  ],
};

function assertEligibleLocal(architecture, label) {
  const local = evaluateRequirements({
    architecture,
    challenge: urlShortenerChallenge,
    registry: componentRegistry,
  });
  assert.equal(local.valid, true, `${label} must be valid`);
  assert.equal(local.allRequirementsPass, true, `${label} must pass requirements locally`);
  assert.ok(local.cost.monthlyTotal <= urlShortenerChallenge.monthlyBudget, `${label} under budget`);
  return local;
}

class CookieJar {
  constructor() {
    this.map = new Map();
  }
  store(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const pair = line.split(";", 1)[0];
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      this.map.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function api(jar, path, { method = "GET", body, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      ...(jar.header() ? { cookie: jar.header() } : {}),
      ...headers,
    },
  };
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${BASE_URL}${path}`, init);
  jar.store(response);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { response, json };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log(`Live Phase 4 verify against ${BASE_URL}`);

// Local fixture sanity
const localCdn = assertEligibleLocal(cdnHeavy, "cdn-heavy");
const localCache = assertEligibleLocal(cacheHeavy, "cache-heavy");
assertEligibleLocal(expensiveEligible, "expensive-eligible");
assert.ok(localCdn.cost.monthlyTotal < localCache.cost.monthlyTotal);

const health = await fetch(`${BASE_URL}/api/health/supabase`);
assert.equal(health.status, 200, "supabase health must be 200");
const healthJson = await health.json();
assert.equal(healthJson.status, "online", `health: ${JSON.stringify(healthJson)}`);

const activeGuest = await api(new CookieJar(), "/api/challenges/active");
assert.equal(activeGuest.response.status, 200);
assert.equal(activeGuest.json.ok, true);
assert.ok(typeof activeGuest.json.challenge.slug === "string" && activeGuest.json.challenge.slug.length > 0);
const challengeVersion = activeGuest.json.challenge.version;
assert.equal(challengeVersion, activeGuest.json.challenge.config.version);
assert.ok(activeGuest.json.challenge.config.workloadAffinity?.mechanisms?.edge_cache);
assert.ok(activeGuest.json.challenge.config.workloadAffinity?.mechanisms?.data_cache);
assert.equal(activeGuest.json.challenge.simulatorVersion, SIMULATOR_VERSION);

const publicFastest = await api(new CookieJar(), "/api/leaderboards/fastest");
assert.equal(publicFastest.response.status, 200);
assert.equal(publicFastest.json.ok, true);
assert.ok(Array.isArray(publicFastest.json.entries));
for (const entry of publicFastest.json.entries) {
  assert.ok(typeof entry.alias === "string" && entry.alias.length > 0);
  assert.equal(entry.userId, undefined);
  assert.equal(entry.user_id, undefined);
}

const publicCheapest = await api(new CookieJar(), "/api/leaderboards/cheapest");
assert.equal(publicCheapest.response.status, 200);
assert.equal(publicCheapest.json.ok, true);

const jarA = new CookieJar();
const start1 = await api(jarA, "/api/attempts/start", { method: "POST" });
assert.equal(start1.response.status, 200, JSON.stringify(start1.json));
assert.equal(start1.json.ok, true);
assert.ok(start1.json.attemptId);
assert.ok(start1.json.alias);
assert.ok(start1.json.startedAt);
const attemptA = start1.json.attemptId;
const aliasA = start1.json.alias;
const startedAtA = start1.json.startedAt;
console.log(`Player A alias=${aliasA} attempt=${attemptA}`);

const start2 = await api(jarA, "/api/attempts/start", { method: "POST" });
assert.equal(start2.json.ok, true);
assert.equal(start2.json.attemptId, attemptA);
assert.equal(start2.json.startedAt, startedAtA);
assert.equal(start2.json.created, false);

const current = await api(jarA, "/api/attempts/current");
assert.equal(current.json.ok, true);
assert.equal(current.json.active, true);
assert.equal(current.json.attemptId, attemptA);
assert.equal(current.json.alias, aliasA);

const meBefore = await api(jarA, "/api/leaderboards/me");
assert.equal(meBefore.json.ok, true);
assert.equal(meBefore.json.authenticated, true);
assert.equal(meBefore.json.ranked, false);

async function submitAttempt(jar, attemptId, architecture, extra = {}) {
  return api(jar, "/api/submissions", {
    method: "POST",
    body: {
      attemptId,
      challengeVersion,
      architecture,
      ...extra,
    },
  });
}

const badVersion = await submitAttempt(jarA, attemptA, underprovisioned, {
  challengeVersion: challengeVersion + 99,
});
assert.equal(badVersion.json.ok, false);
assert.equal(badVersion.json.code, "challenge_version_mismatch");

const invalid = await submitAttempt(jarA, attemptA, { version: 1, components: [], connections: [] });
assert.equal(invalid.json.ok, false);
assert.ok(
  invalid.json.code === "invalid_architecture" || invalid.json.code === "invalid_request",
  invalid.json.code,
);

const failSub = await submitAttempt(jarA, attemptA, underprovisioned, {
  cost: 1,
  p95: 1,
  passed: true,
  solveTime: 1,
});
assert.equal(failSub.json.ok, true, JSON.stringify(failSub.json));
assert.equal(failSub.json.eligible, false);
assert.equal(failSub.json.allRequirementsPass, false);
assert.equal(failSub.json.dailyBest, null);
assert.notEqual(failSub.json.cost.monthlyTotal, 1);

const overSub = await submitAttempt(jarA, attemptA, overBudget);
assert.equal(overSub.json.ok, true, JSON.stringify(overSub.json));
assert.equal(overSub.json.eligible, false);
assert.equal(overSub.json.withinBudget, false);
assert.equal(overSub.json.dailyBest, null);

const firstValid = await submitAttempt(jarA, attemptA, cacheHeavy);
assert.equal(firstValid.json.ok, true, JSON.stringify(firstValid.json));
assert.equal(firstValid.json.eligible, true);
assert.ok(firstValid.json.firstValidAt);
assert.ok(typeof firstValid.json.officialSolveMs === "number");
assert.ok(firstValid.json.dailyBest);
const lockedFirstValidAt = firstValid.json.firstValidAt;
const lockedFastestMs = firstValid.json.dailyBest.fastestSolveMs;
const lockedCostAtFastest = firstValid.json.dailyBest.costAtFastest;
const firstHash = firstValid.json.architectureHash;
assert.equal(firstHash, hashArchitecture(cacheHeavy));

// Browser/server parity on competition fields
assert.equal(firstValid.json.metrics.p95LatencyMs, localCache.p95LatencyMs);
assert.equal(firstValid.json.metrics.throughputRatio, localCache.throughputRatio);
assert.equal(firstValid.json.metrics.headroom, localCache.headroom);
assert.equal(firstValid.json.cost.monthlyTotal, localCache.cost.monthlyTotal);
assert.equal(firstValid.json.simulatorVersion, SIMULATOR_VERSION);

await sleep(50);
const cheaper = await submitAttempt(jarA, attemptA, cdnHeavy);
assert.equal(cheaper.json.ok, true, JSON.stringify(cheaper.json));
assert.equal(cheaper.json.eligible, true);
assert.equal(cheaper.json.firstValidAt, lockedFirstValidAt);
assert.equal(cheaper.json.dailyBest.fastestSolveMs, lockedFastestMs);
assert.equal(cheaper.json.dailyBest.costAtFastest, lockedCostAtFastest);
assert.ok(cheaper.json.dailyBest.cheapestCost < lockedCostAtFastest);
assert.equal(cheaper.json.architectureHash, hashArchitecture(cdnHeavy));
assert.notEqual(cheaper.json.architectureHash, firstHash);

const sameHashAgain = await submitAttempt(jarA, attemptA, cdnHeavy);
assert.equal(sameHashAgain.json.architectureHash, cheaper.json.architectureHash);

const expensive = await submitAttempt(jarA, attemptA, expensiveEligible);
assert.equal(expensive.json.ok, true);
assert.equal(expensive.json.eligible, true);
assert.equal(expensive.json.dailyBest.cheapestCost, cheaper.json.dailyBest.cheapestCost);
assert.equal(expensive.json.dailyBest.fastestSolveMs, lockedFastestMs);

const meAfter = await api(jarA, "/api/leaderboards/me");
assert.equal(meAfter.json.ok, true);
assert.equal(meAfter.json.authenticated, true);
assert.equal(meAfter.json.ranked, true);
assert.equal(meAfter.json.alias, aliasA);
assert.equal(meAfter.json.userId, undefined);
assert.ok(meAfter.json.fastestRank >= 1);
assert.ok(meAfter.json.cheapestRank >= 1);

// Second player for ordering + rank parity — delay so B cannot beat A's locked solve time
const jarB = new CookieJar();
const startB = await api(jarB, "/api/attempts/start", { method: "POST" });
assert.equal(startB.json.ok, true);
assert.notEqual(startB.json.attemptId, attemptA);
assert.notEqual(startB.json.alias, aliasA);
const attemptB = startB.json.attemptId;
const aliasB = startB.json.alias;
console.log(`Player B alias=${aliasB} attempt=${attemptB}`);

await sleep(Math.max(1500, lockedFastestMs + 500));
const bValid = await submitAttempt(jarB, attemptB, cdnHeavy);
assert.equal(bValid.json.ok, true);
assert.equal(bValid.json.eligible, true);
assert.ok(bValid.json.officialSolveMs > lockedFastestMs);

const fastestBoard = await api(new CookieJar(), "/api/leaderboards/fastest");
assert.equal(fastestBoard.json.ok, true);
const fastestEntries = fastestBoard.json.entries;
const aFast = fastestEntries.find((e) => e.alias === aliasA);
const bFast = fastestEntries.find((e) => e.alias === aliasB);
assert.ok(aFast, "A on fastest board");
assert.ok(bFast, "B on fastest board");
assert.ok(
  aFast.fastestSolveMs < bFast.fastestSolveMs ||
    (aFast.fastestSolveMs === bFast.fastestSolveMs && aFast.costAtFastest <= bFast.costAtFastest),
);

const cheapestBoard = await api(new CookieJar(), "/api/leaderboards/cheapest");
const cheapestEntries = cheapestBoard.json.entries;
const aCheap = cheapestEntries.find((e) => e.alias === aliasA);
const bCheap = cheapestEntries.find((e) => e.alias === aliasB);
assert.ok(aCheap);
assert.ok(bCheap);
// A improved to cdn-heavy cheapest; B also cdn-heavy — costs equal, tie-break solve time
assert.equal(aCheap.cheapestCost, bCheap.cheapestCost);

const meA = await api(jarA, "/api/leaderboards/me");
assert.equal(meA.json.fastestRank, aFast.rank);
assert.equal(meA.json.cheapestRank, aCheap.rank);
const meB = await api(jarB, "/api/leaderboards/me");
assert.equal(meB.json.fastestRank, bFast.rank);
assert.equal(meB.json.cheapestRank, bCheap.rank);

// Race safety: third player, two concurrent eligible submits
const jarC = new CookieJar();
const startC = await api(jarC, "/api/attempts/start", { method: "POST" });
assert.equal(startC.json.ok, true);
const attemptC = startC.json.attemptId;
const [race1, race2] = await Promise.all([
  submitAttempt(jarC, attemptC, cacheHeavy),
  submitAttempt(jarC, attemptC, cdnHeavy),
]);
assert.equal(race1.json.ok, true, JSON.stringify(race1.json));
assert.equal(race2.json.ok, true, JSON.stringify(race2.json));
assert.equal(race1.json.eligible, true);
assert.equal(race2.json.eligible, true);
assert.equal(race1.json.firstValidAt, race2.json.firstValidAt);
assert.equal(race1.json.dailyBest.fastestSolveMs, race2.json.dailyBest.fastestSolveMs);
const cheaperOfRace = Math.min(race1.json.cost.monthlyTotal, race2.json.cost.monthlyTotal);
assert.equal(race1.json.dailyBest.cheapestCost, cheaperOfRace);
assert.equal(race2.json.dailyBest.cheapestCost, cheaperOfRace);

const restore = await api(jarA, "/api/attempts/current");
assert.equal(restore.json.active, true);
assert.equal(restore.json.attemptId, attemptA);
assert.equal(restore.json.alias, aliasA);
assert.equal(restore.json.firstValidAt, lockedFirstValidAt);

console.log("verify-phase-4-live: OK");
console.log(
  JSON.stringify(
    {
      aliasA,
      aliasB,
      lockedFastestMs,
      cheapestA: cheaper.json.dailyBest.cheapestCost,
      fastestRanks: { A: aFast.rank, B: bFast.rank },
      cheapestRanks: { A: aCheap.rank, B: bCheap.rank },
      note: "Manual: Verifications 2–5, 23 UI, 26 production URL still required if BASE_URL was local.",
    },
    null,
    2,
  ),
);
