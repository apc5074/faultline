import assert from "node:assert/strict";

import { createEmptyAgentSessionState } from "@faultline/agent-capabilities";
import { urlShortenerChallenge } from "@faultline/challenges";

import {
  applySessionAnnotations,
  clearFocusAnnotationsOnRun,
  clearSessionAnnotations,
  pruneSessionForArchitecture,
  sessionChangedByPrune,
  withPendingHelpRequest,
  withSessionFocus,
} from "../features/agent-session/session-mutations.ts";

const architecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    { id: "postgres-1", type: "postgres", config: {}, deployments: [], ui: { x: 1, y: 0 } },
  ],
  connections: [
    {
      id: "conn-1",
      sourceComponentId: "service-1",
      sourcePortId: "out",
      targetComponentId: "postgres-1",
      targetPortId: "in",
      type: "read_write",
    },
  ],
};

let state = createEmptyAgentSessionState();
assert.equal(state.revision, 0);

state = withSessionFocus(
  state,
  { kind: "component", componentId: "service-1", source: "selection" },
  architecture,
);
assert.equal(state.revision, 1);
assert.equal(state.focus.kind, "component");

state = withSessionFocus(state, { kind: "component", componentId: "missing", source: "agent" }, architecture);
assert.equal(state.revision, 1);

state = withPendingHelpRequest(
  state,
  { id: "help-1", template: "Explain cost", componentId: "service-1" },
  architecture,
);
assert.equal(state.revision, 2);
assert.equal(state.pendingHelpRequest?.id, "help-1");

state = applySessionAnnotations(state, architecture, [
  { id: "a1", type: "focus", componentId: "service-1" },
  { id: "a2", type: "note", componentId: "postgres-1", text: "Is this on the hot path?" },
  { id: "a3", type: "focus", componentId: "missing" },
]);
assert.equal(state.revision, 3);
assert.equal(state.annotations.length, 2);

state = applySessionAnnotations(state, architecture, [
  { id: "a4", type: "focus", componentId: "postgres-1" },
]);
assert.equal(state.annotations.filter((annotation) => annotation.type === "focus").length, 1);
assert.equal(state.annotations.find((annotation) => annotation.type === "focus")?.componentId, "postgres-1");
assert.equal(state.annotations.some((annotation) => annotation.type === "note"), true);

state = clearSessionAnnotations(state, "component", "postgres-1");
assert.equal(state.revision, 5);
assert.equal(state.annotations.length, 0);

state = clearSessionAnnotations(state, "all");
assert.equal(state.revision, 5);
assert.deepEqual(state.annotations, []);

const prunedArchitecture = {
  ...architecture,
  components: architecture.components.filter((component) => component.id !== "service-1"),
  connections: [],
};

state = withSessionFocus(
  createEmptyAgentSessionState(),
  { kind: "component", componentId: "service-1", source: "selection" },
  architecture,
);
state = applySessionAnnotations(state, architecture, [
  { id: "a1", type: "path", connectionId: "conn-1" },
]);
state = withPendingHelpRequest(
  state,
  { id: "help-2", template: "Ask", componentId: "service-1" },
  architecture,
);

const pruned = pruneSessionForArchitecture(state, prunedArchitecture);
assert.equal(pruned.focus.kind, "none");
assert.equal(pruned.pendingHelpRequest, null);
assert.equal(pruned.annotations.length, 0);
assert.equal(pruned.revision, state.revision);
assert.equal(sessionChangedByPrune(state, pruned), true);
assert.equal(sessionChangedByPrune(pruned, pruneSessionForArchitecture(pruned, prunedArchitecture)), false);

let runState = applySessionAnnotations(createEmptyAgentSessionState(), architecture, [
  { id: "f1", type: "focus", componentId: "service-1" },
  { id: "n1", type: "note", componentId: "service-1", text: "Check cache hit rate." },
  { id: "p1", type: "path", connectionId: "conn-1", label: "hot path" },
]);
runState = clearFocusAnnotationsOnRun(runState);
assert.equal(runState.annotations.length, 2);
assert.equal(runState.annotations.every((annotation) => annotation.type !== "focus"), true);
assert.equal(runState.revision, 2);

assert.equal(urlShortenerChallenge.slug, "url-shortener");

console.log("verify-agent-session: ok");
