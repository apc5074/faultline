import assert from "node:assert/strict";

import {
  createDefaultCapabilityRegistry,
  inspectCache,
  inspectCacheCapability,
  resolveCapabilities,
} from "../dist/index.js";

const challenge = {
  slug: "tiny-api",
  version: 1,
  title: "Tiny API",
  prompt: "Build a small API.",
  developmentOnly: true,
  workload: { requestsPerSecond: 6_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 8_000,
  allowedComponentTypes: ["service", "redis", "postgres"],
};

const withoutRedis = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};

const singleRedisArchitecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    {
      id: "redis-1",
      type: "redis",
      config: { mode: "standalone", tier: "medium", ttlBand: "medium" },
      deployments: [{ id: "dep-redis-eu", regionId: "europe", config: {} }],
      ui: { x: 1, y: 0 },
    },
  ],
  connections: [],
};

const dualRedisArchitecture = {
  ...singleRedisArchitecture,
  components: [
    ...singleRedisArchitecture.components,
    {
      id: "redis-2",
      type: "redis",
      config: { mode: "replicated", tier: "large", ttlBand: "long" },
      deployments: [],
      ui: { x: 2, y: 0 },
    },
  ],
};

const simulation = {
  available: true,
  components: {
    "redis-1": {
      metrics: { hitRate: 0.84, utilization: 0.72, readRps: 50_000, readCapacityRps: 65_000 },
      workloadFit: {
        participation: "active",
        role: "read_aside",
        mechanismId: "data_cache",
        challengeCeiling: 0.3,
        playerIntent: 0.8,
        effective: 0.24,
        unitCostPressure: 1,
      },
    },
  },
};

const cost = {
  monthlyTotal: 7_000,
  lineItems: [{ componentId: "redis-1", amount: 3_000 }],
};

assert.equal(inspectCacheCapability.name, "inspect_cache");
assert.equal(inspectCacheCapability.mode, "read");
assert.equal(inspectCacheCapability.availableWhen({ challenge, architecture: withoutRedis }), false);

const noRedisSurface = resolveCapabilities(createDefaultCapabilityRegistry(), { challenge, architecture: withoutRedis });
assert.equal(noRedisSurface.names.includes("inspect_cache"), false);

const context = { challenge, architecture: singleRedisArchitecture, simulation, cost };
const withRedisSurface = resolveCapabilities(createDefaultCapabilityRegistry(), context, { development: true });
assert.ok(withRedisSurface.names.includes("inspect_cache"));

const implicit = inspectCache(context, {});
assert.equal(implicit.ok, true);
if (implicit.ok) {
  assert.deepEqual(implicit.data, {
    componentId: "redis-1",
    cacheType: "redis",
    config: { mode: "standalone", tier: "medium", ttlBand: "medium" },
    simulationAvailable: true,
    deployments: [{ id: "dep-redis-eu", regionId: "europe", config: {} }],
    hitRate: 0.84,
    utilization: 0.72,
    coldCacheExperimentAvailable: true,
    metrics: { hitRate: 0.84, utilization: 0.72, readRps: 50_000, readCapacityRps: 65_000 },
    monthlyCost: 3_000,
    workloadFit: {
      participation: "active",
      role: "read_aside",
      mechanismId: "data_cache",
      challengeCeiling: 0.3,
      playerIntent: 0.8,
      effective: 0.24,
      unitCostPressure: 1,
    },
  });
}

const explicit = inspectCache(context, { componentId: "redis-1" });
assert.deepEqual(explicit, implicit);

const ambiguous = inspectCache({ challenge, architecture: dualRedisArchitecture }, {});
assert.equal(ambiguous.ok, false);
if (!ambiguous.ok) {
  assert.equal(ambiguous.code, "INVALID_INPUT");
  assert.match(ambiguous.message, /componentId/i);
}

const dualResolved = inspectCache(
  { challenge, architecture: dualRedisArchitecture, simulation, cost },
  { componentId: "redis-2" },
);
assert.equal(dualResolved.ok, true);
if (dualResolved.ok) assert.equal(dualResolved.data.componentId, "redis-2");

const unknown = inspectCache(context, { componentId: "missing" });
assert.equal(unknown.ok, false);
if (!unknown.ok) assert.equal(unknown.code, "NOT_FOUND");

const notRedis = inspectCache(context, { componentId: "service-1" });
assert.equal(notRedis.ok, false);
if (!notRedis.ok) assert.equal(notRedis.code, "NOT_FOUND");

const noSimulation = inspectCache({ challenge, architecture: singleRedisArchitecture, cost }, {});
assert.equal(noSimulation.ok, true);
if (noSimulation.ok) {
  assert.equal("metrics" in noSimulation.data, false);
  assert.equal(noSimulation.data.simulationAvailable, false);
  assert.equal(noSimulation.data.coldCacheExperimentAvailable, false);
  assert.equal(noSimulation.data.monthlyCost, 3_000);
}

const registry = createDefaultCapabilityRegistry();
const badInput = await registry.invoke("inspect_cache", context, { componentId: "" });
assert.equal(badInput.ok, false);
if (!badInput.ok) assert.equal(badInput.code, "INVALID_INPUT");

const invoked = await registry.invoke("inspect_cache", context, {});
assert.deepEqual(invoked, implicit);

const serialized = JSON.stringify(implicit.ok ? implicit.data : {});
assert.ok(!serialized.includes('"ui"'));

console.log("verify-inspect-cache: ok");
