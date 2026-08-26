import assert from "node:assert/strict";
import { componentRegistry, distributePostgresReads } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { estimateMonthlyCost, evaluatePostgresCapacity } from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "small" }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "service-postgres", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
};

const zero = evaluatePostgresCapacity({ architecture, challenge: tinyApiChallenge, registry: componentRegistry });
assert.equal(zero.valid, true);
if (!zero.valid) throw new Error("Expected valid architecture.");
assert.deepEqual(zero.postgres["postgres-01"], {
  readRps: 5400,
  writeRps: 600,
  primaryReadRps: 5400,
  replicaReadRps: 0,
  primaryReadCapacityRps: 5000,
  replicaReadCapacityRps: 0,
  readCapacityRps: 5000,
  writeCapacityRps: 800,
  readReplicaCount: 0,
  readUtilization: 1.08,
  writeUtilization: 0.75,
  effectiveUtilization: 1.08,
  readHandledRps: 5000,
  writeHandledRps: 600,
  readCapacityShortfallRps: 400,
  writeCapacityShortfallRps: 0,
  state: "saturated",
});
assert.equal(zero.events.some((event) => event.type === "component_saturated"), true);

function withReplicaCount(count) {
  return evaluatePostgresCapacity({
    architecture: {
      ...architecture,
      components: architecture.components.map((component) =>
        component.id === "postgres-01" ? { ...component, config: { tier: "small", readReplicaCount: count } } : component,
      ),
    },
    challenge: tinyApiChallenge,
    registry: componentRegistry,
  });
}

const one = withReplicaCount(1);
assert.equal(one.valid, true);
if (!one.valid) throw new Error("Expected valid architecture.");
assert.equal(one.postgres["postgres-01"].readCapacityRps, 10_000);
assert.equal(one.postgres["postgres-01"].writeCapacityRps, 800);
assert.equal(one.postgres["postgres-01"].writeRps, 600);
assert.equal(one.postgres["postgres-01"].writeUtilization, 0.75);
assert.equal(one.postgres["postgres-01"].primaryReadRps, 2_700);
assert.equal(one.postgres["postgres-01"].replicaReadRps, 2_700);
assert.equal(one.postgres["postgres-01"].readUtilization, 0.54);

const two = withReplicaCount(2);
assert.equal(two.valid, true);
if (!two.valid) throw new Error("Expected valid architecture.");
assert.equal(two.postgres["postgres-01"].readCapacityRps, 15_000);
assert.equal(two.postgres["postgres-01"].writeUtilization, 0.75);
assert.equal(two.postgres["postgres-01"].primaryReadRps, 1_800);
assert.equal(two.postgres["postgres-01"].replicaReadRps, 3_600);
assert.ok(two.postgres["postgres-01"].readUtilization < one.postgres["postgres-01"].readUtilization);
assert.equal(two.postgres["postgres-01"].writeUtilization, one.postgres["postgres-01"].writeUtilization);

assert.deepEqual(distributePostgresReads(9_000, { tier: "small", readReplicaCount: 2 }), {
  primaryReadRps: 3_000,
  replicaReadRps: 6_000,
});

const writeHeavy = evaluatePostgresCapacity({
  architecture: {
    ...architecture,
    components: architecture.components.map((component) =>
      component.id === "postgres-01" ? { ...component, config: { tier: "large", readReplicaCount: 3 } } : component,
    ),
  },
  challenge: { ...tinyApiChallenge, workload: { ...tinyApiChallenge.workload, readRatio: 0.1, writeRatio: 0.9 } },
  registry: componentRegistry,
});
assert.equal(writeHeavy.valid, true);
if (!writeHeavy.valid) throw new Error("Expected valid architecture.");
assert.equal(writeHeavy.postgres["postgres-01"].writeCapacityRps, 5_000);
assert.equal(writeHeavy.postgres["postgres-01"].writeUtilization, 1.08);
assert.equal(writeHeavy.postgres["postgres-01"].writeCapacityShortfallRps, 400);
assert.equal(writeHeavy.postgres["postgres-01"].replicaReadRps > 0, true);
// Writes never move to replicas: write RPS equals primary write demand.
assert.equal(writeHeavy.postgres["postgres-01"].writeRps, 5_400);

const replicaCost = estimateMonthlyCost({
  architecture: {
    version: 1,
    components: [
      {
        id: "postgres-01",
        type: "postgres",
        config: { tier: "medium", readReplicaCount: 2 },
        deployments: [],
        ui: { x: 0, y: 0 },
      },
    ],
    connections: [],
  },
  registry: componentRegistry,
});
assert.equal(replicaCost.monthlyTotal, 4_000 + 2 * 3_000);

console.log("postgres capacity verified");
