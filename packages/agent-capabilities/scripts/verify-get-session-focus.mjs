import assert from "node:assert/strict";

import {
  buildGetSessionFocusOutput,
  createDefaultCapabilityRegistry,
  createEmptyAgentSessionState,
  getSessionFocusCapability,
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

assert.equal(getSessionFocusCapability.name, "get_session_focus");
assert.equal(getSessionFocusCapability.mode, "read");
assert.equal(getSessionFocusCapability.annotations?.readOnlyHint, true);
assert.equal(getSessionFocusCapability.annotations?.idempotentHint, true);

const emptySession = createEmptyAgentSessionState();
const emptyOutput = buildGetSessionFocusOutput(context, emptySession);
assert.deepEqual(emptyOutput.focus, { kind: "none" });
assert.equal(emptyOutput.pendingHelpRequest, null);
assert.equal("selectedComponentId" in emptyOutput, false);
assert.equal(emptyOutput.revision, 0);

const focusedSession = {
  ...emptySession,
  focus: { kind: "component", componentId: "service-1", source: "selection" },
  pendingHelpRequest: {
    id: "help-1",
    template: "Ask about selection",
    componentId: "service-1",
  },
  revision: 4,
};

const focusedOutput = buildGetSessionFocusOutput(context, focusedSession);
assert.equal(focusedOutput.selectedComponentId, "service-1");
assert.equal(focusedOutput.revision, 4);
assert.equal(focusedOutput.pendingHelpRequest?.id, "help-1");

const staleSession = {
  ...focusedSession,
  focus: { kind: "component", componentId: "deleted", source: "selection" },
  pendingHelpRequest: {
    id: "help-2",
    template: "Find bottleneck",
    componentId: "deleted",
  },
};

const staleOutput = buildGetSessionFocusOutput(context, staleSession);
assert.deepEqual(staleOutput.focus, { kind: "none" });
assert.equal(staleOutput.pendingHelpRequest, null);
assert.equal("selectedComponentId" in staleOutput, false);

const connectionSession = {
  ...emptySession,
  focus: { kind: "connection", connectionId: "conn-1", source: "agent" },
  revision: 2,
};
const connectionOutput = buildGetSessionFocusOutput(context, connectionSession);
assert.equal(connectionOutput.focus.kind, "connection");
assert.equal("selectedComponentId" in connectionOutput, false);

const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("get_session_focus"));

const invoked = await registry.invoke("get_session_focus", context, undefined, {
  session: focusedSession,
});
assert.equal(invoked.ok, true);
if (invoked.ok) {
  assert.deepEqual(invoked.data, focusedOutput);
}

const secondInvoke = await registry.invoke("get_session_focus", context, undefined, {
  session: focusedSession,
});
assert.equal(secondInvoke.ok, true);
if (secondInvoke.ok) {
  assert.equal(secondInvoke.data.pendingHelpRequest?.id, "help-1");
}

const withoutSession = await registry.invoke("get_session_focus", context, undefined);
assert.equal(withoutSession.ok, true);
if (withoutSession.ok) {
  assert.deepEqual(withoutSession.data, emptyOutput);
}

const badInput = await registry.invoke("get_session_focus", context, { unexpected: true }, {
  session: focusedSession,
});
assert.equal(badInput.ok, false);
if (!badInput.ok) {
  assert.equal(badInput.code, "INVALID_INPUT");
}

console.log("verify-get-session-focus: ok");
