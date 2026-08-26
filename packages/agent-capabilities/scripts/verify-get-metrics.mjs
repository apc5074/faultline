import assert from "node:assert/strict";

import {
  buildGetMetricsOutput,
  createDefaultCapabilityRegistry,
  getMetricsCapability,
} from "../dist/index.js";

const challenge = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt: "Design",
  developmentOnly: false,
  workload: { requestsPerSecond: 124_000, readRatio: 0.9, writeRatio: 0.1, hotKeyReadFraction: 0.25 },
  requirements: [],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["service", "redis", "postgres"],
};

const architecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    { id: "redis-1", type: "redis", config: {}, deployments: [], ui: { x: 1, y: 0 } },
    { id: "postgres-1", type: "postgres", config: {}, deployments: [], ui: { x: 2, y: 0 } },
  ],
  connections: [],
};

assert.equal(getMetricsCapability.name, "get_metrics");
assert.equal(getMetricsCapability.mode, "read");

const missing = buildGetMetricsOutput({ challenge, architecture });
assert.deepEqual(missing, {
  simulationAvailable: false,
  validationErrors: ["Simulation evidence is not available."],
});

const invalid = buildGetMetricsOutput({
  challenge,
  architecture,
  simulation: {
    available: false,
    validationErrors: ["No path from traffic-source to postgres."],
  },
});
assert.deepEqual(invalid, {
  simulationAvailable: false,
  validationErrors: ["No path from traffic-source to postgres."],
});

const context = {
  challenge,
  architecture,
  simulation: {
    available: true,
    system: {
      redirectP95Ms: 132,
      throughputPass: true,
      minimumHeadroom: 0.13,
    },
    scenarios: {
      hotKey: { active: true, passed: false },
    },
    components: {
      "service-1": {
        metrics: { utilization: 0.91, incomingRps: 74_000, capacityRps: 80_000 },
        state: "critical",
      },
      "redis-1": {
        metrics: { hitRate: 0.84, utilization: 0.72 },
      },
      "postgres-1": {
        metrics: {
          readUtilization: 0.87,
          writeUtilization: 0.33,
          effectiveUtilization: 0.87,
          readRps: 95_000,
          writeRps: 4_000,
          readCapacityRps: 110_000,
          writeCapacityRps: 12_000,
        },
        state: "warning",
      },
    },
  },
};

const output = buildGetMetricsOutput(context);
assert.deepEqual(output, {
  system: {
    redirectP95Ms: 132,
    throughputPass: true,
    minimumHeadroom: 0.13,
  },
  components: [
    {
      id: "postgres-1",
      utilization: 0.87,
      state: "warning",
      readUtilization: 0.87,
      writeUtilization: 0.33,
    },
    {
      id: "redis-1",
      utilization: 0.72,
      hitRate: 0.84,
    },
    {
      id: "service-1",
      utilization: 0.91,
      state: "critical",
    },
  ],
  scenarios: {
    hotKey: { passed: false },
  },
});

const serialized = JSON.stringify(output);
assert.ok(!serialized.includes("incomingRps"));
assert.ok(!serialized.includes("capacityRps"));
assert.ok(!serialized.includes("events"));
assert.ok(!serialized.includes("effectiveUtilization"));

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("get_metrics"));
const invoked = await registry.invoke("get_metrics", context, undefined);
assert.equal(invoked.ok, true);
if (invoked.ok) assert.deepEqual(invoked.data, output);

console.log("verify-get-metrics: ok");
