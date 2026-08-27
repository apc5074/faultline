import assert from "node:assert/strict";

import { buildGetSessionFocusOutput, createEmptyAgentSessionState } from "@faultline/agent-capabilities";

import {
  AGENT_HELP_CHIPS,
  buildPendingHelpRequest,
  isAgentHelpChipEnabled,
} from "../features/agent-session/agent-help-templates.ts";
import { withPendingHelpRequest, withSessionFocus } from "../features/agent-session/session-mutations.ts";

const architecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
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

assert.equal(AGENT_HELP_CHIPS.length, 4);
assert.equal(AGENT_HELP_CHIPS[0]?.id, "ask-about-selection");
assert.equal(isAgentHelpChipEnabled(AGENT_HELP_CHIPS[0], null), false);
assert.equal(isAgentHelpChipEnabled(AGENT_HELP_CHIPS[0], "service-1"), true);
assert.equal(isAgentHelpChipEnabled(AGENT_HELP_CHIPS[1], null), true);

const askChip = AGENT_HELP_CHIPS[0];
assert.deepEqual(buildPendingHelpRequest(askChip, "service-1"), {
  id: "ask-about-selection",
  template: askChip.template,
  componentId: "service-1",
});

const bottleneckChip = AGENT_HELP_CHIPS[1];
assert.deepEqual(buildPendingHelpRequest(bottleneckChip, "service-1"), {
  id: "find-bottleneck",
  template: bottleneckChip.template,
});

let session = createEmptyAgentSessionState();
session = withSessionFocus(
  session,
  { kind: "component", componentId: "service-1", source: "selection" },
  architecture,
);
assert.equal(session.revision, 1);

session = withPendingHelpRequest(session, buildPendingHelpRequest(askChip, "service-1"), architecture);
assert.equal(session.revision, 2);
assert.equal(session.pendingHelpRequest?.id, "ask-about-selection");

const focusOutput = buildGetSessionFocusOutput(context, session);
assert.equal(focusOutput.selectedComponentId, "service-1");
assert.equal(focusOutput.pendingHelpRequest?.componentId, "service-1");
assert.equal(focusOutput.revision, 2);

for (const chip of AGENT_HELP_CHIPS) {
  assert.ok(chip.clipboardPrompt.includes("get_session_focus"));
}

console.log("verify-agent-help-chips: ok");
