import assert from "node:assert/strict";

import {
  AGENT_NOTE_MAX_TEXT_LENGTH,
  AGENT_PATH_LABEL_MAX_TEXT_LENGTH,
  appendValidatedAnnotations,
  createDefaultCapabilityRegistry,
  createEmptyAgentSessionState,
  focusComponentCapability,
  focusRegionCapability,
} from "../dist/index.js";

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

const challenge = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt: "Design",
  developmentOnly: false,
  workload: { requestsPerSecond: 124_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["service"],
};

const context = { challenge, architecture };
const registry = createDefaultCapabilityRegistry();

assert.match(focusComponentCapability.description, /Inspect read tools first/);
assert.equal(focusComponentCapability.mode, "visual");
assert.equal(focusRegionCapability.mode, "visual");

const missingFocus = await registry.invoke(
  "focus_component",
  context,
  { componentId: "missing" },
  { session: createEmptyAgentSessionState() },
);
assert.equal(missingFocus.ok, false);
if (!missingFocus.ok) assert.equal(missingFocus.code, "NOT_FOUND");

const focus = await registry.invoke(
  "focus_component",
  context,
  { componentId: "service-1" },
  { session: createEmptyAgentSessionState() },
);
assert.equal(focus.ok, true);
if (focus.ok) {
  assert.equal(focus.data.annotation.type, "focus");
  assert.equal(focus.data.annotation.componentId, "service-1");
  assert.equal(focus.data.annotation.source, "external-agent");
  assert.ok(focus.data.annotation.intentId);
}

const geographicContext = {
  ...context,
  challenge: { ...challenge, geographicDistribution: [{ regionId: "us-east", fraction: 1 }] },
};
const focusRegion = await registry.invoke(
  "focus_region",
  geographicContext,
  { regionId: "us-east" },
  { session: createEmptyAgentSessionState() },
);
assert.equal(focusRegion.ok, true);
if (focusRegion.ok) assert.equal(focusRegion.data.regionId, "us-east");

const inactiveRegion = await registry.invoke(
  "focus_region",
  context,
  { regionId: "us-east" },
  { session: createEmptyAgentSessionState() },
);
assert.equal(inactiveRegion.ok, false);

const missingRegion = await registry.invoke(
  "focus_region",
  geographicContext,
  { regionId: "missing" },
  { session: createEmptyAgentSessionState() },
);
assert.equal(missingRegion.ok, false);
if (!missingRegion.ok) assert.equal(missingRegion.code, "NOT_FOUND");

const longNote = await registry.invoke(
  "annotate_component",
  context,
  {
    componentId: "service-1",
    text: "x".repeat(AGENT_NOTE_MAX_TEXT_LENGTH + 1),
  },
  { session: createEmptyAgentSessionState() },
);
assert.equal(longNote.ok, false);
if (!longNote.ok) assert.equal(longNote.code, "INVALID_INPUT");

let session = createEmptyAgentSessionState();

const noteOne = await registry.invoke(
  "annotate_component",
  context,
  { componentId: "service-1", text: "Is this the hot path?", tone: "question" },
  { session },
);
assert.equal(noteOne.ok, true);
if (noteOne.ok) {
  session = appendValidatedAnnotations(session, architecture, [noteOne.data.annotation]);
}

const noteTwo = await registry.invoke(
  "annotate_component",
  context,
  { componentId: "postgres-1", text: "Replica lag could spike redirect latency." },
  { session },
);
assert.equal(noteTwo.ok, true);
if (noteTwo.ok) {
  session = appendValidatedAnnotations(session, architecture, [noteTwo.data.annotation]);
}

assert.equal(session.annotations.length, 2);
assert.equal(session.annotations[0]?.type, "note");
assert.equal(session.annotations[1]?.type, "note");

const path = await registry.invoke(
  "highlight_connection",
  context,
  { connectionId: "conn-1", label: "read path" },
  { session },
);
assert.equal(path.ok, true);
if (path.ok) {
  session = appendValidatedAnnotations(session, architecture, [path.data.annotation]);
  assert.equal(session.annotations.length, 3);
}

const duplicate = await registry.invoke(
  "annotate_component",
  context,
  { componentId: "service-1", text: "Is this the hot path?", tone: "question" },
  { session },
);
assert.equal(duplicate.ok, true);
if (duplicate.ok) session = appendValidatedAnnotations(session, architecture, [duplicate.data.annotation]);
assert.equal(session.annotations.length, 3, "replayed equivalent annotations do not create noise");

const longPathLabel = await registry.invoke(
  "highlight_connection", context, { connectionId: "conn-1", label: "x".repeat(AGENT_PATH_LABEL_MAX_TEXT_LENGTH + 1) }, { session },
);
assert.equal(longPathLabel.ok, false);

const clearAll = await registry.invoke("clear_annotations", context, { scope: "all" }, { session });
assert.equal(clearAll.ok, true);
if (clearAll.ok) {
  assert.equal(clearAll.data.clearedCount, 3);
}

const clearComponent = await registry.invoke(
  "clear_annotations",
  context,
  { scope: "component", componentId: "service-1" },
  { session },
);
assert.equal(clearComponent.ok, true);
if (clearComponent.ok) {
  assert.equal(clearComponent.data.clearedCount, 1);
}

const badClear = await registry.invoke(
  "clear_annotations",
  context,
  { scope: "component" },
  { session },
);
assert.equal(badClear.ok, false);
if (!badClear.ok) assert.equal(badClear.code, "INVALID_INPUT");

console.log("verify-visual-capabilities: ok");
