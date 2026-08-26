import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { evaluatePostgresCapacity } from "../dist/index.js";

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

const result = evaluatePostgresCapacity({ architecture, challenge: tinyApiChallenge, registry: componentRegistry });
assert.equal(result.valid, true);
if (!result.valid) throw new Error("Expected valid architecture.");
assert.deepEqual(result.postgres["postgres-01"], {
  readRps: 5400,
  writeRps: 600,
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
assert.equal(result.events.some((event) => event.type === "component_saturated"), true);

const withReplicas = evaluatePostgresCapacity({
  architecture: {
    ...architecture,
    components: architecture.components.map((component) =>
      component.id === "postgres-01" ? { ...component, config: { tier: "small", readReplicaCount: 1 } } : component,
    ),
  },
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
assert.equal(withReplicas.valid, true);
if (!withReplicas.valid) throw new Error("Expected valid architecture.");
assert.equal(withReplicas.postgres["postgres-01"].readCapacityRps, 10_000);
assert.equal(withReplicas.postgres["postgres-01"].writeCapacityRps, 800);
assert.equal(withReplicas.postgres["postgres-01"].readReplicaCount, 1);
assert.equal(withReplicas.postgres["postgres-01"].readUtilization, 0.54);
assert.equal(withReplicas.postgres["postgres-01"].writeUtilization, 0.75);
assert.equal(withReplicas.postgres["postgres-01"].readCapacityShortfallRps, 0);
assert.equal(withReplicas.postgres["postgres-01"].state, "warning");

const writeHeavy = evaluatePostgresCapacity({
  architecture: { ...architecture, components: architecture.components.map((component) => component.id === "postgres-01" ? { ...component, config: { tier: "large", readReplicaCount: 3 } } : component) },
  challenge: { ...tinyApiChallenge, workload: { ...tinyApiChallenge.workload, readRatio: 0.1, writeRatio: 0.9 } },
  registry: componentRegistry,
});
assert.equal(writeHeavy.valid, true);
if (!writeHeavy.valid) throw new Error("Expected valid architecture.");
assert.equal(writeHeavy.postgres["postgres-01"].readCapacityRps, 80_000);
assert.equal(writeHeavy.postgres["postgres-01"].writeCapacityRps, 4_000);
assert.equal(writeHeavy.postgres["postgres-01"].readUtilization, 0.0075);
assert.equal(writeHeavy.postgres["postgres-01"].writeUtilization, 1.35);
assert.equal(writeHeavy.postgres["postgres-01"].readCapacityShortfallRps, 0);
assert.equal(writeHeavy.postgres["postgres-01"].writeCapacityShortfallRps, 1400);
console.log("postgres capacity verified");
