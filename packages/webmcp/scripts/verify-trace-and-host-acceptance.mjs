import assert from "node:assert/strict";
import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { urlShortenerChallenge } from "../../challenges/dist/index.js";
import { createWebMcpTrace, registerAgentWebMcpSurface, toWebMcpTool } from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: { instances: 2, label: "Private player label" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "postgres-1", type: "postgres", config: { tier: "large" }, deployments: [], ui: { x: 1, y: 0 } },
  ],
  connections: [{ id: "service-db", sourceComponentId: "service-1", targetComponentId: "postgres-1", type: "read_write" }],
};
const context = { challenge: urlShortenerChallenge, architecture, simulation: { available: true, components: { "service-1": { metrics: { utilization: 0.5 } }, "postgres-1": { metrics: { utilization: 0.4 } } } }, evidenceMeta: { architectureRevision: "trace-rev", simulationRunId: "live-trace", simulatorVersion: "trace-sim", isStale: false, generatedAt: "fixed" } };
const registry = createDefaultCapabilityRegistry();
const trace = createWebMcpTrace(64);
const tool = toWebMcpTool(registry.get("inspect_component"), { registry, getContext: () => context, trace: trace.sink, traceGroup: "stable-review", onPresentationCue: () => {} });
const result = await tool.execute({ componentId: "service-1" }, {});
assert.equal(result.ok, true);
assert.ok(trace.events.some((event) => event.name === "tool_invoked"));
assert.ok(trace.events.some((event) => event.name === "lease_acquired"));
assert.ok(trace.events.some((event) => event.name === "capability_completed" && event.outcome === "success"));
assert.ok(trace.events.some((event) => event.name === "cue_derived"));
assert.ok(trace.events.some((event) => event.name === "cue_published"));
assert.ok(result.ok && result.data.subjects);
assert.ok(JSON.stringify(trace.events).length < 16_000);
assert.equal(JSON.stringify(trace.events).includes("service-1"), false);
assert.equal(JSON.stringify(trace.events).includes("Private player label"), false);
assert.equal(JSON.stringify(trace.events).includes("architecture"), false);

const registrations = [];
const registrationTrace = createWebMcpTrace(64);
await registerAgentWebMcpSurface({
  modelContext: { registerTool: async (registered) => registrations.push(registered.name) },
  registry,
  getContext: () => context,
  signal: new AbortController().signal,
  group: "stable-review",
  trace: registrationTrace.sink,
});
assert.ok(registrationTrace.events.some((event) => event.name === "registration_started"));
assert.ok(registrationTrace.events.some((event) => event.name === "tool_registered"));
assert.ok(registrations.includes("review_current_design"));
assert.ok(registrationTrace.events.length <= 64);

console.log("verify-trace-and-host-acceptance: ok");
