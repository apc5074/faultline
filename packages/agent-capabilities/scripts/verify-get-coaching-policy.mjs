import assert from "node:assert/strict";

import {
  buildCoachingPolicy,
  buildGetCoachingPolicyOutput,
  createDefaultCapabilityRegistry,
  getCoachingPolicyCapability,
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
  coachingPolicy: {
    focusThemes: [
      "hot-key resilience",
      "read scaling",
      "global latency",
      "cache-workload-fit",
      "placement-fit",
      "mechanism-fit",
    ],
    prohibitedRevealCategories: [
      "canonical topology",
      "specific component requirements",
      "solution-only thresholds",
    ],
  },
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

assert.equal(getCoachingPolicyCapability.name, "get_coaching_policy");
assert.equal(getCoachingPolicyCapability.mode, "read");
assert.equal(getCoachingPolicyCapability.annotations?.readOnlyHint, true);
assert.equal(getCoachingPolicyCapability.annotations?.idempotentHint, true);

const context = { challenge: urlShortenerLike, architecture: emptyArchitecture };
const output = buildGetCoachingPolicyOutput(context);
assert.equal(output.policyText, buildCoachingPolicy(context));
assert.ok(output.policyText.length > 0);
assert.match(output.policyText, /hot-key resilience/);
assert.match(output.policyText, /cache-workload-fit/);
assert.match(output.policyText, /workload-fit evidence/);
assert.match(output.policyText, /Never change architecture/);
assert.match(output.policyText, /Do not prescribe a canonical stack/);
assert.deepEqual(output.focusThemes, urlShortenerLike.coachingPolicy.focusThemes);
assert.deepEqual(
  output.prohibitedRevealCategories,
  urlShortenerLike.coachingPolicy.prohibitedRevealCategories,
);

const noPolicyContext = { challenge: tinyLike, architecture: emptyArchitecture };
const noPolicyOutput = buildGetCoachingPolicyOutput(noPolicyContext);
assert.equal(noPolicyOutput.policyText, buildCoachingPolicy(noPolicyContext));
assert.deepEqual(noPolicyOutput.focusThemes, []);
assert.deepEqual(noPolicyOutput.prohibitedRevealCategories, []);
assert.match(noPolicyOutput.policyText, /Do not reveal a canonical architecture/);

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("get_coaching_policy"));
assert.ok(registry.available(context).some((capability) => capability.name === "get_coaching_policy"));

const invoked = await registry.invoke("get_coaching_policy", context, undefined);
assert.equal(invoked.ok, true);
if (invoked.ok) {
  assert.deepEqual(invoked.data, output);
}

const emptyInput = await registry.invoke("get_coaching_policy", context, {});
assert.equal(emptyInput.ok, true);

const badInput = await registry.invoke("get_coaching_policy", context, { unexpected: true });
assert.equal(badInput.ok, false);
if (!badInput.ok) {
  assert.equal(badInput.code, "INVALID_INPUT");
}

const serialized = JSON.stringify(output);
assert.ok(!serialized.includes("expected"));
assert.ok(!serialized.includes("recommended"));
assert.ok(!serialized.includes("allowedComponentTypes"));

console.log("verify-get-coaching-policy: ok");
