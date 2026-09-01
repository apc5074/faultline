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
assert.equal(startDesignInterviewCapability.mode, "session");

const opening = buildStartDesignInterviewOutput(context, { step: 0 });
assert.equal(opening.ok, true);
assert.equal(opening.data.phase, "opening");
assert.equal(opening.data.questionId, "opening-1");
assert.equal(opening.data.totalQuestions, 6);
assert.equal(opening.data.architectureRevision, "interview-revision");
assert.match(opening.data.focus, /request/i);
assert.ok(opening.data.contextSignals.includes("4 components"));
assert.ok(opening.data.contextSignals.includes("0 requests\/sec"));
assert.equal(opening.data.agenda.length, 3);
assert.equal(opening.data.agenda[0].questionId, "component-router");
assert.equal(opening.data.agenda[0].ordinal, 4);
assert.equal(opening.data.agenda[1].questionId, "component-services");
assert.equal(opening.data.agenda[1].grouped, true);
assert.deepEqual(opening.data.agenda[1].componentIds, ["service-a", "service-b"]);

const secondOpening = buildStartDesignInterviewOutput(context, { step: 1 });
assert.equal(secondOpening.ok, true);
assert.equal(secondOpening.data.questionId, "opening-2");
assert.equal(secondOpening.data.phase, "opening");
assert.equal(secondOpening.data.presentationCue, undefined);

const thirdOpening = buildStartDesignInterviewOutput(context, { step: 2 });
assert.equal(thirdOpening.ok, true);
assert.equal(thirdOpening.data.questionId, "opening-3");
assert.match(thirdOpening.data.focus, /tradeoff/i);

const component = buildStartDesignInterviewOutput(context, { step: 4 });
assert.equal(component.ok, true);
assert.equal(component.data.phase, "component");
assert.equal(component.data.questionId, "component-services");
assert.equal(component.data.grouped, true);
assert.equal(component.data.presentationCue.kind, "set");
assert.deepEqual(component.data.presentationCue.targets.map((target) => target.entityId), ["service-a", "service-b"]);

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("start_design_interview"));

console.log("start design interview verified");
