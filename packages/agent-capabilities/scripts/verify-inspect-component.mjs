import assert from "node:assert/strict";

import {
  createDefaultCapabilityRegistry,
  inspectComponent,
  inspectComponentCapability,
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
      ui: { x: 1, y: 2 },
    },
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large" },
      deployments: [{ id: "pg-primary", regionId: "us-east", config: { role: "primary" } }],
      ui: { x: 3, y: 4 },
    },
  ],
  connections: [
    { id: "service-db", sourceComponentId: "service-1", targetComponentId: "postgres-1", type: "read_write" },
  ],
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
        p95Ms: 143,
      },
      workloadFit: {
        participation: "active",
        role: "compute",
        mechanismId: "stateless_compute",
        challengeCeiling: 1,
        playerIntent: 1,
        effective: 1,
        unitCostPressure: 1,
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

const cost = {
  monthlyTotal: 14_000,
  lineItems: [
    { componentId: "service-1", amount: 12_000 },
    { componentId: "postgres-1", amount: 2_000 },
  ],
};

assert.equal(inspectComponentCapability.name, "inspect_component");
assert.equal(inspectComponentCapability.mode, "read");

const context = { challenge, architecture, simulation, cost };

const service = inspectComponent(context, { componentId: "service-1" });
assert.equal(service.ok, true);
if (service.ok) {
  assert.deepEqual(service.data, {
    id: "service-1",
    type: "service",
    config: { instances: 8 },
    metrics: {
      incomingRps: 74_000,
      capacityRps: 80_000,
      utilization: 0.925,
      headroom: 0.075,
      p95Ms: 143,
    },
    monthlyCost: 12_000,
    workloadFit: {
      participation: "active",
      role: "compute",
      mechanismId: "stateless_compute",
      challengeCeiling: 1,
      playerIntent: 1,
      effective: 1,
      unitCostPressure: 1,
    },
    topology: {
      upstream: [],
      downstream: [{ id: "postgres-1", type: "postgres", connectionId: "service-db", connectionType: "read_write" }],
    },
  });
}

const postgres = inspectComponent(context, { componentId: "postgres-1" });
assert.equal(postgres.ok, true);
if (postgres.ok) {
  assert.deepEqual(postgres.data, {
    id: "postgres-1",
    type: "postgres",
    config: { tier: "large" },
    metrics: {
      readRps: 95_000,
      readCapacityRps: 110_000,
      readUtilization: 0.864,
      writeRps: 4_000,
      writeCapacityRps: 12_000,
      writeUtilization: 0.333,
    },
    monthlyCost: 2_000,
    topology: {
      upstream: [{ id: "service-1", type: "service", connectionId: "service-db", connectionType: "read_write" }],
      downstream: [],
    },
  });
}

const missing = inspectComponent(context, { componentId: "nope" });
assert.equal(missing.ok, false);
if (!missing.ok) {
  assert.equal(missing.code, "NOT_FOUND");
}

const noSimulation = inspectComponent(
  { challenge, architecture, cost },
  { componentId: "service-1" },
);
assert.equal(noSimulation.ok, true);
if (noSimulation.ok) {
  assert.equal("metrics" in noSimulation.data, false);
  assert.equal(noSimulation.data.monthlyCost, 12_000);
}

const selectorArchitecture = {
  ...architecture,
  components: [
    architecture.components[0],
    architecture.components[1],
    { ...architecture.components[1], id: "postgres-z", ui: { x: 9, y: 10 } },
    { ...architecture.components[1], id: "postgres-a", ui: { x: 3, y: 10 } },
    { ...architecture.components[1], id: "postgres-b", ui: { x: 3, y: 10 } },
  ],
};
const selectorContext = { ...context, architecture: selectorArchitecture };
const allPostgres = inspectComponent(selectorContext, { selector: { type: "postgres", scope: "all" } });
assert.equal(allPostgres.ok, true);
if (allPostgres.ok) {
  assert.deepEqual(allPostgres.data.selection, {
    type: "postgres",
    scope: "all",
    resolvedComponentIds: ["postgres-1", "postgres-a", "postgres-b", "postgres-z"],
  });
  assert.deepEqual(allPostgres.data.components.map((component) => component.id), [
    "postgres-1",
    "postgres-a",
    "postgres-b",
    "postgres-z",
  ]);
}
const topmostPostgres = inspectComponent(selectorContext, { selector: { type: "postgres", scope: "topmost" } });
assert.equal(topmostPostgres.ok, true);
if (topmostPostgres.ok) assert.deepEqual(topmostPostgres.data.selection.resolvedComponentIds, ["postgres-1"]);

const noMatchingType = inspectComponent(context, { selector: { type: "redis", scope: "all" } });
assert.equal(noMatchingType.ok, false);
if (!noMatchingType.ok) assert.equal(noMatchingType.code, "INVALID_INPUT");

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("inspect_component"));

const badInput = await registry.invoke("inspect_component", context, {});
assert.equal(badInput.ok, false);
if (!badInput.ok) assert.equal(badInput.code, "INVALID_INPUT");

const badSelector = await registry.invoke("inspect_component", context, { selector: { type: "DB", scope: "all" } });
assert.equal(badSelector.ok, false);
if (!badSelector.ok) assert.equal(badSelector.code, "INVALID_INPUT");

const invoked = await registry.invoke("inspect_component", context, { componentId: "service-1" });
assert.equal(invoked.ok, true);
if (invoked.ok) assert.deepEqual(invoked.data, service.ok ? service.data : null);

const serialized = JSON.stringify(service.ok ? service.data : {});
assert.ok(!serialized.includes('"ui"'));
assert.ok(!serialized.includes("react"));

console.log("verify-inspect-component: ok");
