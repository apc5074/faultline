/**
 * T-07 — competition config path: seed/active JSON carries workloadAffinity;
 * official verify uses trusted server config; browser + verifySubmission agree on affinity outcomes.
 *
 * Usage: pnpm --filter @faultline/web verify:competition-config
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hashChallengeConfig, urlShortenerChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements, SIMULATOR_VERSION } from "@faultline/simulator";

import { verifySubmission } from "../lib/competition/verify-submission.ts";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readWeb(rel) {
  return readFileSync(join(webRoot, rel), "utf8");
}

console.log("Check — url-shortener publishes workloadAffinity");
assert.ok(urlShortenerChallenge.workloadAffinity?.mechanisms.edge_cache);
assert.ok(urlShortenerChallenge.workloadAffinity?.mechanisms.data_cache);
assert.equal(urlShortenerChallenge.version, 3);

console.log("Check — seed persists full challenge definition");
const seed = readWeb("scripts/seed-daily-challenge.mjs");
assert.match(seed, /const definition = urlShortenerChallenge/);
assert.match(seed, /config_json: definition/);
assert.match(seed, /simulator_version: SIMULATOR_VERSION/);

console.log("Check — active challenge API returns full config");
const activeRoute = readWeb("app/api/challenges/active/route.ts");
assert.match(activeRoute, /config: active\.challengeVersion\.config/);

console.log("Check — official verify uses DB challenge config, not client JSON");
const verifyLib = readWeb("lib/competition/verify-submission.ts");
assert.match(verifyLib, /challenge: challengeVersion\.config/);
const submissionsRoute = readWeb("app/api/submissions/route.ts");
assert.match(submissionsRoute, /getAttemptSubmissionContext/);
assert.match(submissionsRoute, /verifySubmission/);
assert.doesNotMatch(submissionsRoute, /parsed\.config|body\.config|raw\.config|workloadAffinity/);

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

const trustedSnapshot = {
  id: "00000000-0000-4000-8000-000000000002",
  slug: urlShortenerChallenge.slug,
  version: urlShortenerChallenge.version,
  configHash: hashChallengeConfig(urlShortenerChallenge),
  simulatorVersion: SIMULATOR_VERSION,
  config: urlShortenerChallenge,
};

function assertVerifyParity(architecture, label) {
  const browser = evaluateRequirements({
    architecture,
    challenge: urlShortenerChallenge,
    registry: componentRegistry,
  });
  assert.equal(browser.valid, true, `${label} browser valid`);
  if (!browser.valid) throw new Error(`${label} browser invalid`);

  const server = verifySubmission({ architecture, challengeVersion: trustedSnapshot });
  assert.equal(server.ok, true, `${label} server verify`);
  if (!server.ok) throw new Error(server.message);

  assert.equal(server.metrics.p95LatencyMs, browser.p95LatencyMs, `${label} p95`);
  assert.equal(server.metrics.throughputRatio, browser.throughputRatio, `${label} throughput`);
  assert.equal(server.metrics.headroom, browser.headroom, `${label} headroom`);
  assert.deepEqual(server.cost, browser.cost, `${label} cost`);
  return browser;
}

console.log("Check — placement demotion + cache hits match between browser and verifySubmission");
const readAside = assertVerifyParity(readAsideArchitecture(), "read-aside");
const misplaced = assertVerifyParity(misplacedArchitecture(), "misplaced");
const readAsideCache = readAside.caches["redis1"];
const misplacedCache = misplaced.caches["redis1"];
assert.equal(readAsideCache.role, "read_aside");
assert.equal(misplacedCache.role, "misplaced");
assert.ok(readAsideCache.hitRps > misplacedCache.hitRps);

console.log("Check — tampered trusted affinity would change outcomes (DB snapshot must be authoritative)");
const tamperedSnapshot = {
  ...trustedSnapshot,
  config: {
    ...urlShortenerChallenge,
    workloadAffinity: {
      roleDefaults: { unreachable: 0, misplaced: 0.05 },
      mechanisms: {
        data_cache: { maxEffectiveness: 1, byRole: { read_aside: 1 }, reuseConcentration: 0.8 },
      },
    },
  },
};
const tamperedBrowser = evaluateRequirements({
  architecture: readAsideArchitecture(),
  challenge: tamperedSnapshot.config,
  registry: componentRegistry,
});
assert.equal(tamperedBrowser.valid, true);
if (!tamperedBrowser.valid) throw new Error("tampered browser invalid");
assert.ok(tamperedBrowser.caches["redis1"].hitRps > readAsideCache.hitRps);

console.log("competition config path verified");
console.log(`simulator_version=${SIMULATOR_VERSION}`);
console.log(`url-shortener config_hash=${trustedSnapshot.configHash}`);
