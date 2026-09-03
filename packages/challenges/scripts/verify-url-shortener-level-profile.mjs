import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertLevelProfile,
  challengeShapedFieldsFromLevelProfile,
  compileChallengeFromLevelProfile,
  getLevelProfile,
  urlShortenerChallenge,
} from "../dist/index.js";
import { loadLevelProfile } from "../dist/load-level-profile.js";

const profilePath = join(dirname(fileURLToPath(import.meta.url)), "../src/levels/url-shortener.level.json");
const profile = JSON.parse(readFileSync(profilePath, "utf8"));

assertLevelProfile(profile);
assert.deepEqual(loadLevelProfile("url-shortener"), profile);
assert.deepEqual(getLevelProfile("url-shortener"), profile);
assert.deepEqual(compileChallengeFromLevelProfile(profile), urlShortenerChallenge);

assert.equal(profile.identity.slug, "url-shortener");
assert.equal(profile.identity.version, 4);
assert.equal(profile.schemaVersion, 1);

const sandboxTypes = profile.sandbox.components.map((component) => component.type);
assert.deepEqual(sandboxTypes, [
  "traffic-source",
  "global-router",
  "load-balancer",
  "service",
  "cdn",
  "redis",
  "postgres",
]);

const edgeBand = profile.volumeProfile.bands.find((band) => band.mechanismId === "edge_cache");
const dataBand = profile.volumeProfile.bands.find((band) => band.mechanismId === "data_cache");
assert.ok(edgeBand);
assert.ok(dataBand);
assert.ok(
  dataBand.baselineShareOfRedirects.max < edgeBand.baselineShareOfRedirects.min,
  "data_cache baseline max must be below edge_cache baseline min (CDN ≫ Redis teaching order)",
);

assert.equal(profile.volumeProfile.rules.baselineCdnOutranksDataCache, true);
assert.equal(profile.volumeProfile.rules.hotKeyMayEmphasizeDataCache, true);

assert.equal(profile.starterArchitecture.components.length, 3);
assert.ok(profile.starterArchitecture.components.some((component) => component.id === "traffic-source-start"));
assert.ok(profile.starterArchitecture.components.some((component) => component.id === "service-start"));
assert.ok(profile.starterArchitecture.components.some((component) => component.id === "postgres-start"));
const service = profile.starterArchitecture.components.find((component) => component.id === "service-start");
assert.equal(service.config.size, "medium");
assert.equal(service.config.instances, 3);
assert.equal(service.deployments[0].regionId, "us-east");
assert.equal(service.deployments[0].config.instances, 3);

assert.ok(!JSON.stringify(profile.sandbox).toLowerCase().includes("absorbs most average"));
assert.match(JSON.stringify(profile.sandbox.components.find((c) => c.type === "redis")), /viral/i);

const compiled = challengeShapedFieldsFromLevelProfile(profile);
assert.equal(compiled.slug, urlShortenerChallenge.slug);
assert.equal(compiled.version, urlShortenerChallenge.version);
assert.equal(compiled.title, urlShortenerChallenge.title);
assert.equal(compiled.prompt, urlShortenerChallenge.prompt);
assert.equal(compiled.developmentOnly, urlShortenerChallenge.developmentOnly);
assert.deepEqual(compiled.workload, urlShortenerChallenge.workload);
assert.deepEqual(compiled.geographicDistribution, urlShortenerChallenge.geographicDistribution);
assert.deepEqual(compiled.transferPayload, urlShortenerChallenge.transferPayload);
assert.deepEqual(compiled.coachingPolicy, urlShortenerChallenge.coachingPolicy);
assert.deepEqual(compiled.workloadAffinity, urlShortenerChallenge.workloadAffinity);
assert.deepEqual(compiled.requirements, urlShortenerChallenge.requirements);
assert.equal(compiled.monthlyBudget, urlShortenerChallenge.monthlyBudget);
assert.deepEqual(compiled.unscoredTargets, urlShortenerChallenge.unscoredTargets);
assert.deepEqual(compiled.allowedComponentTypes, urlShortenerChallenge.allowedComponentTypes);
assert.equal(
  compiled.prompt,
  "Design infrastructure for a global URL shortening service. It must absorb heavy redirect traffic, accept new links, survive a viral short URL, and stay within latency, capacity headroom, and monthly budget — without a prescribed topology.",
);
assert.notEqual(compiled.prompt, profile.narrative.hook);

assert.ok(profile.playtestChecklist.length >= 9);
assert.ok(profile.narrative.briefingBeats.length >= 4);
assert.deepEqual(profile.narrative.outOfScope, ["Queue", "Worker", "Event Stream", "Rate Limiter"]);

assert.equal(urlShortenerChallenge.prompt, profile.identity.prompt);

console.log("verify-url-shortener-level-profile: ok");
