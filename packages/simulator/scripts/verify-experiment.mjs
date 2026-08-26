import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { evaluateExperiment, evaluateRequirements } from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "service-postgres", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
};

const input = {
  architecture,
  challenge: tinyApiChallenge,
  registry: componentRegistry,
};

const baseline = evaluateRequirements(input);
assert.equal(baseline.valid, true);
if (!baseline.valid) throw new Error("Expected valid baseline.");

const experiment = evaluateExperiment({
  ...input,
  experiment: { type: "traffic_multiplier", parameters: { multiplier: 2 } },
});
assert.equal(experiment.ok, true);
if (!experiment.ok) throw new Error("Expected successful experiment.");
assert.equal(experiment.data.simulated, true);
assert.equal(experiment.data.simulatorVersion, "1");
assert.equal(experiment.data.type, "traffic_multiplier");
assert.deepEqual(experiment.data.baseline.requirements, experiment.data.outcome.requirements);
assert.equal(experiment.data.delta.requirements.newlyFailed.length, 0);
assert.equal(experiment.data.delta.requirements.newlyPassed.length, 0);
assert.equal(Object.keys(experiment.data.delta.metrics).length, 0);
assert.equal(experiment.data.baseline.allRequirementsPass, baseline.allRequirementsPass);
assert.equal(experiment.data.baseline.p95LatencyMs, baseline.p95LatencyMs);
assert.equal(experiment.data.baseline.throughputRatio, baseline.throughputRatio);
assert.equal(experiment.data.baseline.cost.monthlyTotal, baseline.cost.monthlyTotal);
assert.ok(experiment.data.events.length > 0);

const firstRun = JSON.stringify(experiment.data);
const secondRun = JSON.stringify(
  evaluateExperiment({
    ...input,
    experiment: { type: "traffic_multiplier", parameters: { multiplier: 2 } },
  }).data,
);
assert.equal(firstRun, secondRun);

const invalidBaseline = evaluateExperiment({
  architecture: { version: 1, components: [], connections: [] },
  challenge: tinyApiChallenge,
  registry: componentRegistry,
  experiment: { type: "traffic_multiplier", parameters: { multiplier: 2 } },
});
assert.equal(invalidBaseline.ok, false);
if (invalidBaseline.ok) throw new Error("Expected invalid baseline error.");
assert.equal(invalidBaseline.code, "INVALID_BASELINE");

const invalidExperiment = evaluateExperiment({
  ...input,
  experiment: { type: "traffic_multiplier", parameters: { multiplier: 1 } },
});
assert.equal(invalidExperiment.ok, false);
if (invalidExperiment.ok) throw new Error("Expected invalid experiment.");
assert.equal(invalidExperiment.code, "INVALID_INPUT");

console.log("experiment evaluation verified");
