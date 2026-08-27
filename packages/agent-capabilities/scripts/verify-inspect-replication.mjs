import assert from "node:assert/strict";

import {
  createDefaultCapabilityRegistry,
  inspectReplication,
  inspectReplicationCapability,
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
  allowedComponentTypes: ["service", "postgres"],
};

const withoutReplica = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 0 },
      deployments: [],
      ui: { x: 1, y: 0 },
    },
  ],
  connections: [],
};

const logicalReplicaArchitecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 2 },
      deployments: [],
      ui: { x: 1, y: 0 },
    },
  ],
  connections: [],
};

const deploymentReplicaArchitecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    {
      id: "postgres-1",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 2 },
      deployments: [
        { id: "pg-primary", regionId: "us-east", config: { role: "primary" } },
        { id: "pg-replica-eu", regionId: "europe", config: { role: "replica" } },
        { id: "pg-replica-ap", regionId: "asia-pacific", config: { role: "replica" } },
      ],
      ui: { x: 1, y: 0 },
    },
  ],
  connections: [],
};

const dualPostgresArchitecture = {
  ...logicalReplicaArchitecture,
  components: [
    ...logicalReplicaArchitecture.components,
    {
      id: "postgres-2",
      type: "postgres",
      config: { tier: "medium", readReplicaCount: 1 },
      deployments: [],
      ui: { x: 2, y: 0 },
    },
  ],
};

const simulation = {
  available: true,
  components: {
    "postgres-1": {
      metrics: {
        readRps: 9_000,
        primaryReadRps: 3_000,
        replicaReadRps: 6_000,
        readUtilization: 0.54,
        writeUtilization: 0.22,
        readReplicaCount: 2,
      },
    },
  },
};

const cost = {
  monthlyTotal: 7_000,
  lineItems: [{ componentId: "postgres-1", amount: 4_500 }],
};

assert.equal(inspectReplicationCapability.name, "inspect_replication");
assert.equal(inspectReplicationCapability.mode, "read");
assert.equal(inspectReplicationCapability.availableWhen({ challenge, architecture: withoutReplica }), false);

const noReplicaSurface = resolveCapabilities(createDefaultCapabilityRegistry(), {
  challenge,
  architecture: withoutReplica,
});
assert.equal(noReplicaSurface.names.includes("inspect_replication"), false);

const context = { challenge, architecture: logicalReplicaArchitecture, simulation, cost };
const withReplicaSurface = resolveCapabilities(createDefaultCapabilityRegistry(), context, {
  development: true,
});
assert.ok(withReplicaSurface.names.includes("inspect_replication"));

const implicit = inspectReplication(context, {});
assert.equal(implicit.ok, true);
if (implicit.ok) {
  assert.deepEqual(implicit.data, {
    componentId: "postgres-1",
    config: { tier: "large", readReplicaCount: 2 },
    replicaCount: 2,
    readDistribution: {
      readRps: 9_000,
      primaryReadRps: 3_000,
      replicaReadRps: 6_000,
      readUtilization: 0.54,
      writeUtilization: 0.22,
      readReplicaCount: 2,
    },
    replicaCostFacts: [{ amount: 4_500 }],
    semantics: { replicationLagSimulated: false, primaryPromotionSimulated: false, failoverHealthEvaluated: false },
    monthlyCost: 4_500,
  });
}

const explicit = inspectReplication(context, { componentId: "postgres-1" });
assert.deepEqual(explicit, implicit);

const deploymentContext = { challenge, architecture: deploymentReplicaArchitecture, simulation, cost };
const deploymentResult = inspectReplication(deploymentContext, {});
assert.equal(deploymentResult.ok, true);
if (deploymentResult.ok) {
  assert.equal(deploymentResult.data.replicaCount, 2);
  assert.deepEqual(deploymentResult.data.primary, {
    deploymentId: "pg-primary",
    regionId: "us-east",
  });
  assert.deepEqual(deploymentResult.data.replicas, [
    { id: "pg-replica-ap", regionId: "asia-pacific", config: { role: "replica" } },
    { id: "pg-replica-eu", regionId: "europe", config: { role: "replica" } },
  ]);
}

const ambiguous = inspectReplication({ challenge, architecture: dualPostgresArchitecture }, {});
assert.equal(ambiguous.ok, false);
if (!ambiguous.ok) {
  assert.equal(ambiguous.code, "INVALID_INPUT");
  assert.match(ambiguous.message, /componentId/i);
}

const dualResolved = inspectReplication(
  { challenge, architecture: dualPostgresArchitecture, simulation, cost },
  { componentId: "postgres-2" },
);
assert.equal(dualResolved.ok, true);
if (dualResolved.ok) assert.equal(dualResolved.data.componentId, "postgres-2");

const unknown = inspectReplication(context, { componentId: "missing" });
assert.equal(unknown.ok, false);
if (!unknown.ok) assert.equal(unknown.code, "NOT_FOUND");

const notEligible = inspectReplication(context, { componentId: "service-1" });
assert.equal(notEligible.ok, false);
if (!notEligible.ok) assert.equal(notEligible.code, "NOT_FOUND");

const noSimulation = inspectReplication({ challenge, architecture: logicalReplicaArchitecture, cost }, {});
assert.equal(noSimulation.ok, true);
if (noSimulation.ok) {
  assert.equal("readDistribution" in noSimulation.data, false);
  assert.equal(noSimulation.data.monthlyCost, 4_500);
  assert.equal(noSimulation.data.replicaCount, 2);
}

const registry = createDefaultCapabilityRegistry();
const badInput = await registry.invoke("inspect_replication", context, { componentId: "" });
assert.equal(badInput.ok, false);
if (!badInput.ok) assert.equal(badInput.code, "INVALID_INPUT");

const invoked = await registry.invoke("inspect_replication", context, {});
assert.deepEqual(invoked, implicit);

const serialized = JSON.stringify(implicit.ok ? implicit.data : {});
assert.ok(!serialized.includes('"ui"'));
assert.ok(!serialized.includes("lag"));

console.log("verify-inspect-replication: ok");
