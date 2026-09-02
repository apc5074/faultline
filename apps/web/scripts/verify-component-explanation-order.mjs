import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry, createEmptyAgentSessionState } from "@faultline/agent-capabilities";
import { buildAgentReadSurface, createWebMcpTrace, registerAgentWebMcpSurface, toWebMcpTool } from "@faultline/webmcp";

const architecture = {
  version: 1,
  components: [{ id: "cdn-1", type: "cdn", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};
const challenge = {
  slug: "verification", version: 1, title: "Verification", prompt: "Verify.", developmentOnly: true,
  workload: { requestsPerSecond: 1, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 1,
  allowedComponentTypes: ["cdn"],
};
const context = { architecture, challenge, evidenceMeta: { architectureRevision: "revision-a", simulationRunId: "live-verification", simulatorVersion: "test", isStale: false } };
const registry = createDefaultCapabilityRegistry();
const trace = createWebMcpTrace();
const order = [];
const tool = toWebMcpTool(registry.get("inspect_component"), {
  registry,
  getContext: () => ({ context, session: createEmptyAgentSessionState() }),
  getCurrentEvidenceRevision: () => "revision-a",
  requireComponentExplanationPresentation: true,
  development: true,
  trace: trace.sink,
  onVisualIntent: (intent) => {
    assert.equal(intent.kind, "annotation");
    assert.equal(intent.annotation.type, "focus");
    order.push("focus-published");
  },
  onComponentExplanationPresentation: async (command) => {
    order.push("barrier-registered");
    return {
      contractVersion: command.contractVersion,
      commandId: command.commandId,
      componentId: command.component.entityId,
      evidenceRevision: command.evidenceRevision,
      appliedSessionRevision: command.sessionRevision + 1,
      status: "applied",
    };
  },
});
const result = await tool.execute({ componentId: "cdn-1" }, {});
assert.equal(result.ok, true);
order.push("evidence-returned");
assert.deepEqual(order, ["barrier-registered", "focus-published", "evidence-returned"]);
assert.deepEqual(trace.events.map((event) => event.name).filter((name) => ["component_target_resolved", "visual_barrier_started", "focus_component_invoked", "visual_barrier_rendered", "evidence_released"].includes(name)), ["component_target_resolved", "visual_barrier_started", "focus_component_invoked", "visual_barrier_rendered", "evidence_released"]);

const unavailable = toWebMcpTool(registry.get("inspect_component"), {
  registry,
  getContext: () => ({ context, session: createEmptyAgentSessionState() }),
  getCurrentEvidenceRevision: () => "revision-a",
  requireComponentExplanationPresentation: true,
});
const unavailableResult = await unavailable.execute({ componentId: "cdn-1" }, {});
assert.equal(unavailableResult.ok, false);
assert.equal(unavailableResult.code, "PRESENTATION_UNAVAILABLE");
assert.equal("data" in unavailableResult, false);

const registeredVisualIntents = [];
const registeredSurface = await buildAgentReadSurface({
  registry,
  getContext: () => ({ context, session: createEmptyAgentSessionState() }),
  getCurrentEvidenceRevision: () => "revision-a",
  profile: "production",
  enforceComponentExplanationPresentation: true,
  onVisualIntent: (intent) => registeredVisualIntents.push(intent),
  onComponentExplanationPresentation: async (command) => ({
    contractVersion: command.contractVersion,
    commandId: command.commandId,
    componentId: command.component.entityId,
    evidenceRevision: command.evidenceRevision,
    appliedSessionRevision: command.sessionRevision + 1,
    status: "applied",
  }),
});
const registeredInspect = registeredSurface.tools.find((candidate) => candidate.name === "inspect_component");
assert.ok(registeredInspect, "production review surface includes inspect_component");
const registeredResult = await registeredInspect.execute({ componentId: "cdn-1" }, {});
assert.equal(registeredResult.ok, true);
assert.equal(registeredVisualIntents.length, 1);
assert.equal(registeredVisualIntents[0]?.kind, "annotation");
assert.equal(registeredVisualIntents[0]?.annotation.type, "focus");

const hostTools = [];
const hostVisualIntents = [];
const controller = new AbortController();
await registerAgentWebMcpSurface({
  modelContext: { registerTool: async (tool) => { hostTools.push(tool); } },
  registry,
  getContext: () => ({ context, session: createEmptyAgentSessionState() }),
  getCurrentEvidenceRevision: () => "revision-a",
  signal: controller.signal,
  group: "stable-review",
  onVisualIntent: (intent) => hostVisualIntents.push(intent),
  onComponentExplanationPresentation: async (command) => ({
    contractVersion: command.contractVersion,
    commandId: command.commandId,
    componentId: command.component.entityId,
    evidenceRevision: command.evidenceRevision,
    appliedSessionRevision: command.sessionRevision + 1,
    status: "applied",
  }),
});
const hostInspect = hostTools.find((candidate) => candidate.name === "inspect_component");
assert.ok(hostInspect, "registered review host includes inspect_component");
assert.equal((await hostInspect.execute({ componentId: "cdn-1" }, {})).ok, true);
assert.equal(hostVisualIntents.length, 1, "registered review tool publishes nested focus");

console.log("verify-component-explanation-order: ok");
