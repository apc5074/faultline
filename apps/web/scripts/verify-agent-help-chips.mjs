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

assert.equal(AGENT_HELP_CHIPS.length, 5);
const noFocus = { kind: "none" };
const componentFocus = { kind: "component", componentId: "service-1", source: "selection" };
assert.equal(AGENT_HELP_CHIPS[0]?.id, "ask-about-selection");
assert.equal(AGENT_HELP_CHIPS[1]?.id, "trace-workload");
assert.equal(AGENT_HELP_CHIPS[2]?.id, "review-requirement");
assert.equal(AGENT_HELP_CHIPS[3]?.id, "review-cost");
assert.equal(AGENT_HELP_CHIPS[4]?.id, "start-interview");
assert.equal(isAgentHelpChipEnabled(AGENT_HELP_CHIPS[0], noFocus), false);
assert.equal(isAgentHelpChipEnabled(AGENT_HELP_CHIPS[0], componentFocus), true);
assert.equal(isAgentHelpChipEnabled(AGENT_HELP_CHIPS[1], noFocus), true);
assert.equal(isAgentHelpChipEnabled(AGENT_HELP_CHIPS[4], noFocus), true);

const askChip = AGENT_HELP_CHIPS[0];
assert.deepEqual(buildPendingHelpRequest(askChip, componentFocus, 7), {
  id: "ask-about-selection",
  template: askChip.template,
  promptIntent: "component_review",
  focusRevision: 7,
  suggestedCapabilityNames: askChip.suggestedCapabilityNames,
  componentId: "service-1",
});

const bottleneckChip = AGENT_HELP_CHIPS[1];
assert.deepEqual(buildPendingHelpRequest(bottleneckChip, noFocus, 0), {
  id: "trace-workload",
  template: bottleneckChip.template,
  promptIntent: "workload_trace",
  focusRevision: 0,
  suggestedCapabilityNames: bottleneckChip.suggestedCapabilityNames,
});

let session = createEmptyAgentSessionState();
session = withSessionFocus(
  session,
  { kind: "component", componentId: "service-1", source: "selection" },
  architecture,
);
assert.equal(session.revision, 1);

session = withPendingHelpRequest(session, buildPendingHelpRequest(askChip, componentFocus, session.revision), architecture);
assert.equal(session.revision, 2);
assert.equal(session.pendingHelpRequest?.id, "ask-about-selection");

const focusOutput = buildGetSessionFocusOutput(context, session);
assert.equal(focusOutput.selectedComponentId, "service-1");
assert.equal(focusOutput.pendingHelpRequest?.componentId, "service-1");
assert.equal(focusOutput.revision, 2);

for (const chip of AGENT_HELP_CHIPS) {
  assert.ok(chip.suggestedCapabilityNames.length > 0);
  if (chip.id === "start-interview") {
    assert.equal(chip.routingIntent, "design_interview");
    assert.deepEqual(chip.suggestedCapabilityNames, ["start_design_interview"]);
    assert.match(chip.clipboardPrompt, /start_design_interview/);
    assert.match(chip.clipboardPrompt, /do not invent a freeform/i);
    continue;
  }
  assert.ok(chip.clipboardPrompt.includes("Faultline"));
  assert.ok(chip.clipboardPrompt.includes("one"));
  assert.match(chip.clipboardPrompt, /do not modify|without changing/);
  assert.ok(chip.suggestedCapabilityNames.includes("review_current_design"));
}

console.log("verify-agent-help-chips: ok");
