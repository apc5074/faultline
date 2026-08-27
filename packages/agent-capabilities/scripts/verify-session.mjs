import assert from "node:assert/strict";

import {
  AGENT_ANNOTATION_MAX_COUNT,
  AGENT_NOTE_MAX_TEXT_LENGTH,
  createEmptyAgentSessionState,
  pruneAnnotationsAgainstArchitecture,
  prunePendingHelpRequestAgainstArchitecture,
  pruneSessionFocusAgainstArchitecture,
  validateAnnotationAgainstArchitecture,
} from "../dist/session.js";

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

const empty = createEmptyAgentSessionState();
assert.deepEqual(empty.focus, { kind: "none" });
assert.equal(empty.pendingHelpRequest, null);
assert.deepEqual(empty.annotations, []);
assert.equal(empty.revision, 0);

assert.equal(AGENT_ANNOTATION_MAX_COUNT, 12);
assert.equal(AGENT_NOTE_MAX_TEXT_LENGTH, 280);

const validFocus = validateAnnotationAgainstArchitecture(
  { id: "a1", type: "focus", componentId: "service-1" },
  architecture,
);
assert.deepEqual(validFocus, { ok: true });

const validNote = validateAnnotationAgainstArchitecture(
  {
    id: "a2",
    type: "note",
    componentId: "postgres-1",
    text: "What happens on replica lag?",
    tone: "question",
  },
  architecture,
);
assert.deepEqual(validNote, { ok: true });

const validPath = validateAnnotationAgainstArchitecture(
  { id: "a3", type: "path", connectionId: "conn-1", label: "hot path" },
  architecture,
);
assert.deepEqual(validPath, { ok: true });

const validStamp = validateAnnotationAgainstArchitecture(
  { id: "a4", type: "stamp", text: "get_metrics: redirect p95 182ms", toolName: "get_metrics" },
  architecture,
);
assert.deepEqual(validStamp, { ok: true });

const missingComponent = validateAnnotationAgainstArchitecture(
  { id: "a5", type: "focus", componentId: "missing" },
  architecture,
);
assert.equal(missingComponent.ok, false);
if (!missingComponent.ok) {
  assert.equal(missingComponent.code, "NOT_FOUND");
}

const missingConnection = validateAnnotationAgainstArchitecture(
  { id: "a6", type: "path", connectionId: "missing" },
  architecture,
);
assert.equal(missingConnection.ok, false);
if (!missingConnection.ok) {
  assert.equal(missingConnection.code, "NOT_FOUND");
}

const emptyNote = validateAnnotationAgainstArchitecture(
  { id: "a7", type: "note", componentId: "service-1", text: "   " },
  architecture,
);
assert.equal(emptyNote.ok, false);
if (!emptyNote.ok) {
  assert.equal(emptyNote.code, "INVALID_INPUT");
}

const longNote = validateAnnotationAgainstArchitecture(
  {
    id: "a8",
    type: "note",
    componentId: "service-1",
    text: "x".repeat(AGENT_NOTE_MAX_TEXT_LENGTH + 1),
  },
  architecture,
);
assert.equal(longNote.ok, false);
if (!longNote.ok) {
  assert.equal(longNote.code, "INVALID_INPUT");
}

const badTone = validateAnnotationAgainstArchitecture(
  {
    id: "a9",
    type: "note",
    componentId: "service-1",
    text: "Check cache behavior.",
    tone: "warning",
  },
  architecture,
);
assert.equal(badTone.ok, false);
if (!badTone.ok) {
  assert.equal(badTone.code, "INVALID_INPUT");
}

const annotations = [
  { id: "a1", type: "focus", componentId: "service-1" },
  { id: "a2", type: "path", connectionId: "conn-1" },
  { id: "a3", type: "focus", componentId: "deleted" },
];

const prunedArchitecture = {
  ...architecture,
  components: architecture.components.filter((component) => component.id !== "service-1"),
  connections: [],
};

assert.deepEqual(pruneAnnotationsAgainstArchitecture(annotations, prunedArchitecture), []);

const pruned = pruneAnnotationsAgainstArchitecture(annotations, prunedArchitecture);
assert.equal(pruned.length, 0);

assert.deepEqual(
  pruneSessionFocusAgainstArchitecture(
    { kind: "component", componentId: "service-1", source: "selection" },
    prunedArchitecture,
  ),
  { kind: "none" },
);

assert.deepEqual(
  pruneSessionFocusAgainstArchitecture(
    { kind: "connection", connectionId: "conn-1", source: "agent" },
    prunedArchitecture,
  ),
  { kind: "none" },
);

assert.deepEqual(
  pruneSessionFocusAgainstArchitecture({ kind: "none" }, prunedArchitecture),
  { kind: "none" },
);

assert.equal(
  prunePendingHelpRequestAgainstArchitecture(
    { id: "help-1", template: "Explain cost", componentId: "service-1" },
    prunedArchitecture,
  ),
  null,
);

assert.deepEqual(
  prunePendingHelpRequestAgainstArchitecture(
    { id: "help-2", template: "Find bottleneck" },
    prunedArchitecture,
  ),
  { id: "help-2", template: "Find bottleneck" },
);

console.log("verify-session: ok");
