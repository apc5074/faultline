import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { createCoachingSessionGate, createWebMcpTrace, registerAgentWebMcpSurface } from "../dist/index.js";

const registry = createDefaultCapabilityRegistry();
const gate = createCoachingSessionGate();
const trace = createWebMcpTrace();
let currentContext = {
  challenge: {
    slug: "tiny-api",
    version: 1,
    title: "Tiny API",
    prompt: "Build an API.",
    developmentOnly: true,
    workload: { requestsPerSecond: 6_000, readRatio: 0.9, writeRatio: 0.1 },
    requirements: [],
    monthlyBudget: 8_000,
    allowedComponentTypes: ["service"],
  },
  architecture: {
    version: 1,
    components: [{ id: "service-1", type: "service", config: { instances: 1 }, deployments: [], ui: { x: 0, y: 0 } }],
    connections: [],
  },
  simulation: { available: true, components: { "service-1": { metrics: { incomingRps: 1_000, capacityRps: 2_000, utilization: 0.5 } } } },
  evidenceMeta: { architectureRevision: "gate-rev-1", simulationRunId: "live-gate", simulatorVersion: "test", isStale: false, generatedAt: "fixed" },
};

const tools = new Map();
for (const group of ["stable-review", "stable-visual"]) {
  await registerAgentWebMcpSurface({
    modelContext: { registerTool: async (tool) => { tools.set(tool.name, tool); } },
    registry,
    getContext: () => currentContext,
    signal: new AbortController().signal,
    group,
    coachingSessionGate: gate,
    trace: trace.sink,
  });
}

const tool = (name) => {
  const registered = tools.get(name);
  assert.ok(registered, `Expected ${name} to be registered.`);
  return registered;
};

const metrics = tool("get_metrics");
const focus = tool("focus_component");
const policy = tool("get_coaching_policy");
const sessionFocus = tool("get_session_focus");

const beforePolicy = await metrics.execute({}, {});
assert.equal(beforePolicy.ok, false);
if (!beforePolicy.ok) {
  assert.equal(beforePolicy.code, "POLICY_REQUIRED");
  assert.equal(beforePolicy.recovery?.recoveryTool, "get_coaching_policy");
}
assert.ok(trace.events.some((event) => event.name === "coaching_policy_required" && event.capability === "get_metrics"));

const beforePolicyVisual = await focus.execute({ componentId: "service-1" }, {});
assert.equal(beforePolicyVisual.ok, false);
if (!beforePolicyVisual.ok) assert.equal(beforePolicyVisual.code, "POLICY_REQUIRED");

const [policyResult, focusResult] = await Promise.all([
  policy.execute({}, {}),
  sessionFocus.execute({}, {}),
]);
assert.equal(policyResult.ok, true);
assert.equal(focusResult.ok, true);
assert.ok(trace.events.some((event) => event.name === "coaching_policy_bootstrapped" && event.capability === "get_coaching_policy"));

assert.equal((await metrics.execute({}, {})).ok, true);
assert.equal((await focus.execute({ componentId: "service-1" }, {})).ok, true);

currentContext = {
  ...currentContext,
  challenge: { ...currentContext.challenge, slug: "tiny-api-next", version: 2 },
  evidenceMeta: { ...currentContext.evidenceMeta, architectureRevision: "gate-rev-2" },
};
const afterChallengeChange = await metrics.execute({}, {});
assert.equal(afterChallengeChange.ok, false);
if (!afterChallengeChange.ok) assert.equal(afterChallengeChange.code, "POLICY_REQUIRED");
assert.ok(trace.events.some((event) => event.name === "coaching_policy_reset" && event.reason === "challenge_changed"));

console.log("verify-coaching-session-gate: ok");
