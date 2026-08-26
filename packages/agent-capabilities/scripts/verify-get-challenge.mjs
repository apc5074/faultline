import assert from "node:assert/strict";

import {
  DuplicateCapabilityError,
  UnknownCapabilityError,
  buildGetChallengeOutput,
  createDefaultCapabilityRegistry,
  getChallengeCapability,
} from "../dist/index.js";

const emptyArchitecture = { version: 1, components: [], connections: [] };

const urlShortenerLike = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt: "Design infrastructure for a global URL shortening service.",
  developmentOnly: false,
  workload: {
    requestsPerSecond: 124_000,
    readRatio: 120_000 / 124_000,
    writeRatio: 4_000 / 124_000,
    hotKeyReadFraction: 0.25,
  },
  requirements: [],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["service", "postgres"],
};

const tinyLike = {
  slug: "tiny-api",
  version: 1,
  title: "Tiny API",
  prompt: "Build a small API.",
  developmentOnly: true,
  workload: {
    requestsPerSecond: 6_000,
    readRatio: 0.9,
    writeRatio: 0.1,
  },
  requirements: [],
  monthlyBudget: 8_000,
  allowedComponentTypes: ["service"],
};

assert.equal(getChallengeCapability.name, "get_challenge");
assert.equal(getChallengeCapability.mode, "read");
assert.equal(getChallengeCapability.annotations?.readOnlyHint, true);

const output = buildGetChallengeOutput(urlShortenerLike);
assert.equal(output.slug, "url-shortener");
assert.equal(output.title, "Global URL Shortener");
assert.equal(output.workload.redirectsPerSecond, 120_000);
assert.equal(output.workload.writesPerSecond, 4_000);
assert.deepEqual(output.specialScenarios, [{ type: "hot_key", share: 0.25 }]);
assert.equal(output.budgetMonthly, 85_000);
assert.equal("prompt" in output, false);
assert.equal("allowedComponentTypes" in output, false);
assert.equal("requirements" in output, false);

const noHotKey = buildGetChallengeOutput(tinyLike);
assert.deepEqual(noHotKey.specialScenarios, []);
assert.equal(noHotKey.workload.redirectsPerSecond, 5_400);
assert.equal(noHotKey.workload.writesPerSecond, 600);
assert.equal(noHotKey.budgetMonthly, 8_000);

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("get_challenge"));
assert.equal(registry.list().length, 1);
assert.equal(registry.get("get_challenge").name, "get_challenge");

const context = { challenge: urlShortenerLike, architecture: emptyArchitecture };
assert.equal(registry.available(context).length, 1);

const invoked = await registry.invoke("get_challenge", context, undefined);
assert.equal(invoked.ok, true);
if (invoked.ok) {
  assert.deepEqual(invoked.data, output);
}

const emptyInput = await registry.invoke("get_challenge", context, {});
assert.equal(emptyInput.ok, true);

const badInput = await registry.invoke("get_challenge", context, { unexpected: true });
assert.equal(badInput.ok, false);
if (!badInput.ok) {
  assert.equal(badInput.code, "INVALID_INPUT");
}

assert.throws(() => registry.get("missing"), UnknownCapabilityError);
assert.throws(() => registry.register(getChallengeCapability), DuplicateCapabilityError);

const serialized = JSON.stringify(output);
assert.ok(!serialized.includes("expected"));
assert.ok(!serialized.includes("recommended"));
assert.ok(!serialized.includes("allowedComponentTypes"));

console.log("verify-get-challenge: ok");
