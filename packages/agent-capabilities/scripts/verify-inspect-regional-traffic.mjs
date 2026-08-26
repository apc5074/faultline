import assert from "node:assert/strict";

import {
  buildAgentRegionalEvidence,
  createDefaultCapabilityRegistry,
  crossRegionCostFacts,
  deploymentInventoryFromArchitecture,
  inspectRegionalTraffic,
  inspectRegionalTrafficCapability,
  resolveCapabilities,
} from "../dist/index.js";

const challenge = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt: "Design",
  developmentOnly: false,
  workload: { requestsPerSecond: 120_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["service", "postgres"],
  geographicDistribution: [
    { regionId: "us-east", fraction: 0.5 },
    { regionId: "europe", fraction: 0.5 },
  ],
};

const singleRegionArchitecture = {
  version: 1,
  components: [
    {
      id: "service-1",
      type: "service",
      config: { instances: 4 },
      deployments: [{ id: "svc-east", regionId: "us-east", config: { instances: 4 } }],
      ui: { x: 0, y: 0 },
    },
  ],
  connections: [],
};

const multiRegionArchitecture = {
  version: 1,
  components: [
    {
      id: "service-1",
      type: "service",
      config: { instances: 6 },
      deployments: [
        { id: "svc-east", regionId: "us-east", config: { instances: 3 } },
        { id: "svc-eu", regionId: "europe", config: { instances: 3 } },
      ],
      ui: { x: 0, y: 0 },
    },
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 1 },
      deployments: [
        { id: "pg-primary", regionId: "us-east", config: { role: "primary" } },
        { id: "pg-replica-eu", regionId: "europe", config: { role: "replica" } },
      ],
      ui: { x: 1, y: 0 },
    },
  ],
  connections: [],
};

const regionalEvidence = buildAgentRegionalEvidence({
  regionalWorkload: {
    active: true,
    origins: [
      { regionId: "europe", redirectRps: 54_000, writeRps: 6_000 },
      { regionId: "us-east", redirectRps: 54_000, writeRps: 6_000 },
    ],
  },
  geographicRoutes: [
    {
      originRegion: "europe",
      destinationRegion: "europe",
      componentId: "service-1",
      deploymentId: "svc-eu",
      kind: "request",
      rps: 54_000,
      networkLatencyMs: 0,
    },
    {
      originRegion: "us-east",
      destinationRegion: "us-east",
      componentId: "service-1",
      deploymentId: "svc-east",
      kind: "request",
      rps: 54_000,
      networkLatencyMs: 0,
    },
    {
      originRegion: "europe",
      destinationRegion: "us-east",
      componentId: "postgres-1",
      deploymentId: "pg-primary",
      kind: "write",
      rps: 6_000,
      networkLatencyMs: 82,
    },
  ],
});

const cost = {
  monthlyTotal: 12_000,
  lineItems: [
    { componentId: "service-1", amount: 4_000 },
    {
      componentId: "xfer:us-east->europe",
      amount: 250,
      label: "Transfer · US East → Europe",
    },
    {
      componentId: "repl:us-east->europe",
      amount: 120,
      label: "Replication · US East → Europe",
    },
  ],
};

assert.equal(inspectRegionalTrafficCapability.name, "inspect_regional_traffic");
assert.equal(inspectRegionalTrafficCapability.mode, "read");
assert.equal(
  inspectRegionalTrafficCapability.availableWhen({ challenge, architecture: singleRegionArchitecture }),
  false,
);

const noMultiRegionSurface = resolveCapabilities(createDefaultCapabilityRegistry(), {
  challenge,
  architecture: singleRegionArchitecture,
});
assert.equal(noMultiRegionSurface.names.includes("inspect_regional_traffic"), false);

const inventory = deploymentInventoryFromArchitecture(multiRegionArchitecture);
assert.deepEqual(inventory.regions, ["europe", "us-east"]);
assert.equal(inventory.deployments.length, 4);

const crossRegion = crossRegionCostFacts(cost);
assert.equal(crossRegion.length, 2);
assert.equal(crossRegion[0]?.kind, "replication");
assert.equal(crossRegion[1]?.kind, "transfer");

const context = {
  challenge,
  architecture: multiRegionArchitecture,
  simulation: {
    available: true,
    components: {},
    system: { redirectP95Ms: 118 },
    regional: regionalEvidence,
  },
  cost,
};

const withRegionsSurface = resolveCapabilities(createDefaultCapabilityRegistry(), context, {
  development: true,
});
assert.ok(withRegionsSurface.names.includes("inspect_regional_traffic"));

const result = inspectRegionalTraffic(context);
assert.equal(result.ok, true);
if (result.ok) {
  assert.deepEqual(result.data, {
    regions: ["europe", "us-east"],
    deployments: inventory.deployments,
    simulationAvailable: true,
    regionalTraffic: regionalEvidence,
    redirectP95Ms: 118,
    crossRegionCosts: crossRegion,
  });
}

const unavailableSimulation = inspectRegionalTraffic({ challenge, architecture: multiRegionArchitecture });
assert.equal(unavailableSimulation.ok, true);
if (unavailableSimulation.ok) {
  assert.equal(unavailableSimulation.data.simulationAvailable, false);
  assert.deepEqual(unavailableSimulation.data.validationErrors, ["Simulation evidence is not available."]);
  assert.equal("regionalTraffic" in unavailableSimulation.data, false);
  assert.equal("redirectP95Ms" in unavailableSimulation.data, false);
  assert.deepEqual(unavailableSimulation.data.regions, ["europe", "us-east"]);
}

const invalidSimulation = inspectRegionalTraffic({
  challenge,
  architecture: multiRegionArchitecture,
  simulation: {
    available: false,
    validationErrors: ["Postgres replica count mismatch."],
  },
});
assert.equal(invalidSimulation.ok, true);
if (invalidSimulation.ok) {
  assert.equal(invalidSimulation.data.simulationAvailable, false);
  assert.deepEqual(invalidSimulation.data.validationErrors, ["Postgres replica count mismatch."]);
}

const registry = createDefaultCapabilityRegistry();
const invoked = await registry.invoke("inspect_regional_traffic", context, undefined);
assert.deepEqual(invoked, result);

const serialized = JSON.stringify(result.ok ? result.data : {});
assert.ok(!serialized.includes('"ui"'));
assert.ok(!serialized.includes("svg"));

console.log("verify-inspect-regional-traffic: ok");
