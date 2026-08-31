import assert from "node:assert/strict";

import {
  buildStartDesignInterviewOutput,
  createDefaultCapabilityRegistry,
  startDesignInterviewCapability,
} from "../dist/index.js";

const context = {
  challenge: { requirements: [] },
  architecture: {
    version: 1,
    components: [
      { id: "router", type: "global-router", config: {}, deployments: [], ui: { x: 0, y: 0 } },
      { id: "service-a", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 0, y: 0 } },
      { id: "service-b", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 0, y: 0 } },
      { id: "db", type: "postgres", config: { role: "primary" }, deployments: [], ui: { x: 0, y: 0 } },
    ],
    connections: [],
  },
  evidenceMeta: {
    architectureRevision: "interview-revision",
    simulationRunId: "run-1",
    simulatorVersion: "3",
    isStale: false,
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
};

assert.equal(startDesignInterviewCapability.name, "start_design_interview");
assert.equal(startDesignInterviewCapability.mode, "read");

const opening = buildStartDesignInterviewOutput(context, { step: 0 });
assert.equal(opening.ok, true);
assert.equal(opening.data.phase, "opening");
assert.equal(opening.data.openingQuestions.length, 3);
assert.equal(opening.data.agenda[1].grouped, true);
assert.deepEqual(opening.data.agenda[1].componentIds, ["service-a", "service-b"]);

const component = buildStartDesignInterviewOutput(context, { step: 2 });
assert.equal(component.ok, true);
assert.equal(component.data.phase, "component");
assert.equal(component.data.grouped, true);
assert.equal(component.data.presentationCue.kind, "set");
assert.deepEqual(component.data.presentationCue.targets.map((target) => target.entityId), ["service-a", "service-b"]);

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("start_design_interview"));

console.log("start design interview verified");
