import assert from "node:assert/strict";

import {
  BASELINE_READ_CAPABILITY_NAMES,
  BASELINE_VISUAL_CAPABILITY_NAMES,
  createDefaultCapabilityRegistry,
  createEmptyAgentSessionState,
} from "@faultline/agent-capabilities";
import { urlShortenerChallenge } from "@faultline/challenges";
import { buildAgentReadSurface, buildVisualWebMcpSurface } from "@faultline/webmcp";

const architecture = {
  version: 1,
  components: [
    { id: "traffic-source-start", type: "traffic-source", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-1", type: "service", config: { instances: 2 }, deployments: [], ui: { x: 1, y: 0 } },
  ],
  connections: [],
};

const session = {
  ...createEmptyAgentSessionState(),
  focus: { kind: "component", componentId: "service-1", source: "help" },
  pendingHelpRequest: {
    id: "ask-about-selection",
    template: "Coach the player about their selected component.",
    componentId: "service-1",
  },
  revision: 2,
};
const context = { challenge: urlShortenerChallenge, architecture };
const registry = createDefaultCapabilityRegistry();
const getContext = () => ({ context, session });

const readSurface = await buildAgentReadSurface({ registry, getContext, development: true });
assert.deepEqual(readSurface.resolvedNames, [...BASELINE_READ_CAPABILITY_NAMES]);
assert.ok(readSurface.tools.some((tool) => tool.name === "get_coaching_policy"));
assert.ok(readSurface.tools.some((tool) => tool.name === "get_session_focus"));

const policyTool = readSurface.tools.find((tool) => tool.name === "get_coaching_policy");
assert.ok(policyTool);
const policy = await policyTool.execute(undefined, {});
assert.equal(policy.ok, true);
if (policy.ok) assert.ok(policy.data.policyText.length > 0);

const focusTool = readSurface.tools.find((tool) => tool.name === "get_session_focus");
assert.ok(focusTool);
const focus = await focusTool.execute(undefined, {});
assert.equal(focus.ok, true);
if (focus.ok) assert.equal(focus.data.focus.kind, "component");

const visualSurface = await buildVisualWebMcpSurface({ registry, getContext, development: true });
assert.deepEqual(visualSurface.resolvedNames, [...BASELINE_VISUAL_CAPABILITY_NAMES]);
assert.deepEqual(visualSurface.tools.map((tool) => tool.name), [...BASELINE_VISUAL_CAPABILITY_NAMES]);
for (const tool of visualSurface.tools) {
  assert.equal(tool.annotations?.readOnlyHint, false);
  assert.equal(tool.annotations?.destructiveHint, false);
}

console.log("verify-webmcp-first: ok");
