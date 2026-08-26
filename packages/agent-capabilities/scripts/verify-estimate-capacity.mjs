import assert from "node:assert/strict";

import {
  createDefaultCapabilityRegistry,
  estimateCapacity,
  estimateCapacityCapability,
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
  allowedComponentTypes: ["service", "postgres"],
};

const architecture = {
  version: 1,
  components: [
    {
      id: "service-1",
      type: "service",
      config: { instances: 8 },
      deployments: [],
      ui: { x: 0, y: 0 },
    },
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large" },
      deployments: [],
      ui: { x: 1, y: 1 },
    },
  ],
  connections: [],
};

const simulation = {
  available: true,
  components: {
    "service-1": {
      metrics: {
        incomingRps: 74_000,
        capacityRps: 80_000,
        utilization: 0.925,
        headroom: 0.075,
      },
    },
    "postgres-1": {
      metrics: {
        readRps: 95_000,
        readCapacityRps: 110_000,
        readUtilization: 0.864,
        writeRps: 4_000,
        writeCapacityRps: 12_000,
        writeUtilization: 0.333,
      },
    },
  },
};

assert.equal(estimateCapacityCapability.name, "estimate_capacity");
assert.equal(estimateCapacityCapability.mode, "read");

const context = { challenge, architecture, simulation };
const summary = estimateCapacity(context, {});
assert.equal(summary.ok, true);
if (summary.ok) {
  assert.deepEqual(summary.data, {
    bottleneck: {
      componentId: "service-1",
      resource: "request_capacity",
      utilization: 0.925,
    },
    components: [
      {
        componentId: "postgres-1",
        resource: "read",
        capacity: 110_000,
        load: 95_000,
        headroom: 0.136,
      },
      {
        componentId: "service-1",
        capacity: 80_000,
        load: 74_000,
        headroom: 0.075,
      },
    ],
  });
}

const one = estimateCapacity(context, { componentId: "postgres-1" });
assert.equal(one.ok, true);
if (one.ok) {
  assert.deepEqual(one.data, {
    componentId: "postgres-1",
    resources: [
      {
        resource: "read",
        capacity: 110_000,
        load: 95_000,
        utilization: 0.864,
        headroom: 0.136,
      },
      {
        resource: "write",
        capacity: 12_000,
        load: 4_000,
        utilization: 0.333,
        headroom: 0.667,
      },
    ],
  });
}

const missing = estimateCapacity(context, { componentId: "nope" });
assert.equal(missing.ok, false);
if (!missing.ok) assert.equal(missing.code, "NOT_FOUND");

const unavailable = estimateCapacity({ challenge, architecture }, {});
assert.equal(unavailable.ok, false);
if (!unavailable.ok) assert.equal(unavailable.code, "SIMULATION_UNAVAILABLE");

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("estimate_capacity"));

const invoked = await registry.invoke("estimate_capacity", context, {});
assert.equal(invoked.ok, true);

const bad = await registry.invoke("estimate_capacity", context, { componentId: "" });
assert.equal(bad.ok, false);
if (!bad.ok) assert.equal(bad.code, "INVALID_INPUT");

console.log("verify-estimate-capacity: ok");
