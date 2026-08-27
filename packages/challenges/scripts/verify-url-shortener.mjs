import assert from "node:assert/strict";
import {
  ChallengeDefinitionError,
  assertChallengeDefinition,
  urlShortenerChallenge,
  urlShortenerRedirectRps,
  urlShortenerTotalRps,
  urlShortenerWriteRps,
} from "../dist/index.js";

assert.equal(urlShortenerChallenge.slug, "url-shortener");
assert.equal(urlShortenerChallenge.version, 2);
assert.equal(urlShortenerChallenge.developmentOnly, false);
assert.equal(urlShortenerRedirectRps, 120_000);
assert.equal(urlShortenerWriteRps, 4_000);
assert.equal(urlShortenerTotalRps, 124_000);
assert.equal(urlShortenerChallenge.workload.requestsPerSecond, 124_000);
assert.ok(Math.abs(urlShortenerChallenge.workload.readRatio * urlShortenerTotalRps - urlShortenerRedirectRps) < 1e-9);
assert.ok(Math.abs(urlShortenerChallenge.workload.writeRatio * urlShortenerTotalRps - urlShortenerWriteRps) < 1e-9);
assert.equal(urlShortenerRedirectRps / urlShortenerWriteRps, 30);
assert.equal(urlShortenerChallenge.workload.hotKeyReadFraction, 0.25);
assert.equal(urlShortenerChallenge.monthlyBudget, 85_000);
assert.equal(urlShortenerChallenge.requirements.find((requirement) => requirement.id === "latency")?.target, 150);
assert.equal(urlShortenerChallenge.requirements.find((requirement) => requirement.id === "headroom")?.target, 0.2);
assert.equal(urlShortenerChallenge.requirements.find((requirement) => requirement.id === "budget")?.target, 85_000);
assert.ok(!urlShortenerChallenge.requirements.some((requirement) => requirement.id === "availability"));
assert.equal(urlShortenerChallenge.unscoredTargets?.[0]?.id, "availability");
assert.equal(urlShortenerChallenge.unscoredTargets?.[0]?.target, 0.9999);
assert.ok(urlShortenerChallenge.geographicDistribution);
assert.equal(urlShortenerChallenge.geographicDistribution.length, 6);
assert.ok(
  Math.abs(urlShortenerChallenge.geographicDistribution.reduce((sum, entry) => sum + entry.fraction, 0) - 1) < 1e-9,
);
const expectedFractions = {
  "us-east": 0.25,
  "us-west": 0.2,
  europe: 0.25,
  india: 0.1,
  singapore: 0.1,
  tokyo: 0.1,
};
for (const share of urlShortenerChallenge.geographicDistribution) {
  assert.equal(share.fraction, expectedFractions[share.regionId]);
}
assert.ok(urlShortenerChallenge.workloadAffinity?.mechanisms.edge_cache);
assert.ok(urlShortenerChallenge.workloadAffinity?.mechanisms.data_cache);
for (const type of ["traffic-source", "global-router", "load-balancer", "service", "cdn", "redis", "postgres"]) {
  assert.ok(urlShortenerChallenge.allowedComponentTypes.includes(type));
}

assert.throws(
  () =>
    assertChallengeDefinition({
      ...urlShortenerChallenge,
      geographicDistribution: [{ regionId: "atlantis", fraction: 1 }],
    }),
  ChallengeDefinitionError,
);

console.log("url-shortener challenge verified");
