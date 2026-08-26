import assert from "node:assert/strict";

import {
  buildGetRequirementsOutput,
  createDefaultCapabilityRegistry,
  getRequirementsCapability,
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
  requirements: [
    { id: "throughput", label: "Throughput", type: "throughput", comparator: "gte", target: 1, unit: "ratio" },
    { id: "latency", label: "Redirect p95 latency", type: "latency", comparator: "lt", target: 150, unit: "ms" },
    { id: "headroom", label: "Capacity headroom", type: "headroom", comparator: "gte", target: 0.2, unit: "ratio" },
    {
      id: "budget",
      label: "Monthly infrastructure budget",
      type: "budget",
      comparator: "lte",
      target: 85_000,
      unit: "usd/month",
    },
  ],
  unscoredTargets: [
    {
      id: "availability",
      label: "Availability",
      target: 0.9999,
      unit: "ratio",
      reason: "Deferred until truthful resilience semantics exist.",
    },
  ],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["service", "postgres"],
};

const customChallenge = {
  slug: "custom-api",
  version: 1,
  title: "Custom API",
  prompt: "Custom",
  developmentOnly: true,
  workload: {
    requestsPerSecond: 1_000,
    readRatio: 0.5,
    writeRatio: 0.5,
  },
  requirements: [
    { id: "latency", label: "p95 latency", type: "latency", comparator: "lt", target: 200, unit: "ms" },
    { id: "budget", label: "Budget", type: "budget", comparator: "lte", target: 3_000, unit: "usd/month" },
  ],
  monthlyBudget: 3_000,
  allowedComponentTypes: ["service"],
};

assert.equal(getRequirementsCapability.name, "get_requirements");
assert.equal(getRequirementsCapability.mode, "read");
assert.equal(getRequirementsCapability.annotations?.readOnlyHint, true);

const { requirements } = buildGetRequirementsOutput(urlShortenerLike);

assert.deepEqual(
  requirements.find((item) => item.type === "latency"),
  { type: "latency", metric: "redirect_p95_ms", operator: "<", target: 150, state: "active" },
);
assert.deepEqual(
  requirements.find((item) => item.type === "headroom"),
  { type: "headroom", operator: ">=", target: 0.2, state: "active" },
);
assert.deepEqual(
  requirements.find((item) => item.type === "budget"),
  { type: "budget", operator: "<=", target: 85_000, state: "active" },
);
assert.deepEqual(
  requirements.find((item) => item.type === "throughput"),
  { type: "throughput", metric: "throughput_ratio", operator: ">=", target: 1, state: "active" },
);
assert.deepEqual(
  requirements.find((item) => item.type === "hot_key"),
  { type: "hot_key", share: 0.25, state: "active" },
);
assert.deepEqual(
  requirements.find((item) => item.type === "availability"),
  {
    type: "availability",
    target: 0.9999,
    unit: "ratio",
    state: "deferred",
    reason: "Deferred until truthful resilience semantics exist.",
  },
);

for (const item of requirements) {
  assert.equal("passed" in item, false);
  assert.equal("actual" in item, false);
}

const custom = buildGetRequirementsOutput(customChallenge);
assert.deepEqual(
  custom.requirements.find((item) => item.type === "latency"),
  { type: "latency", metric: "p95_ms", operator: "<", target: 200, state: "active" },
);
assert.deepEqual(
  custom.requirements.find((item) => item.type === "budget"),
  { type: "budget", operator: "<=", target: 3_000, state: "active" },
);
assert.equal(
  custom.requirements.some((item) => item.type === "hot_key"),
  false,
);
assert.equal(
  custom.requirements.some((item) => item.target === 85_000),
  false,
);

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("get_requirements"));
assert.ok(registry.list().length >= 2);

const context = { challenge: urlShortenerLike, architecture: emptyArchitecture };
const invoked = await registry.invoke("get_requirements", context, undefined);
assert.equal(invoked.ok, true);
if (invoked.ok) {
  assert.deepEqual(invoked.data, { requirements });
}

console.log("verify-get-requirements: ok");
