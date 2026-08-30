import assert from "node:assert/strict";
import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { urlShortenerChallenge } from "@faultline/challenges";
import { registerAgentWebMcpSurface } from "@faultline/webmcp";
import { createAgentContext } from "../lib/agent-context/create-agent-context.ts";

const architecture = {
  version: 1,
  components: [
    { id: "traffic-source-start", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 80, y: 180 } },
    { id: "service-1", type: "service", config: { instances: 2 }, deployments: [], ui: { x: 220, y: 180 } },
  ],
  connections: [],
};

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
}

async function registrationRun(events) {
  const registry = createDefaultCapabilityRegistry();
  const tools = new Map();
  let evaluations = 0;
  const getContext = () => createAgentContext(architecture, urlShortenerChallenge, { onSimulatorEvaluation: (durationMs) => { evaluations += 1; events.push({ kind: "timing", name: "simulator_evaluation_ms", durationMs }); } });
  const result = await registerAgentWebMcpSurface({
    modelContext: { registerTool: async (tool) => { tools.set(tool.name, tool); } },
    registry,
    getContext,
    signal: new AbortController().signal,
    development: true,
    timing: (event) => events.push(event),
  });
  return { result, tools, evaluations };
}

async function invoke(tools, name, input = {}) {
  const tool = tools.get(name);
  assert.ok(tool, `Expected registered tool ${name}`);
  return tool.execute(input, {});
}

const coldEvents = [];
const cold = await registrationRun(coldEvents);
const warmEvents = [];
const warm = await registrationRun(warmEvents);
const reviewEvents = [];
const review = await registrationRun(reviewEvents);
await invoke(review.tools, "get_coaching_policy");
await invoke(review.tools, "get_session_focus");
await invoke(review.tools, "inspect_component", { componentId: "service-1" });
await invoke(review.tools, "get_metrics");
for (let index = 0; index < 10; index += 1) await invoke(review.tools, index % 2 ? "get_metrics" : "inspect_component", index % 2 ? {} : { componentId: "service-1" });

const metadataBytes = [...cold.tools.values()].reduce((sum, tool) => sum + JSON.stringify({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations ?? null }).length, 0);
const registrationMs = [...coldEvents, ...warmEvents, ...reviewEvents].filter((event) => event.name === "registration_total_ms").map((event) => event.durationMs ?? 0);
const registrationSummary = (events) => {
  const values = events.filter((event) => event.name === "registration_total_ms").map((event) => event.durationMs ?? 0);
  return { p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: Math.max(...values) };
};
const surfaceBuildMs = [...coldEvents, ...warmEvents, ...reviewEvents].filter((event) => event.name === "surface_build_ms").map((event) => event.durationMs ?? 0);
const contextSnapshotMs = reviewEvents.filter((event) => event.name === "context_snapshot_ms").map((event) => event.durationMs ?? 0);
const resultBytes = reviewEvents.filter((event) => event.name === "result_bytes").map((event) => event.bytes ?? 0);
const callbacks = reviewEvents.filter((event) => event.name === "tool_callback_total_ms").map((event) => event.durationMs ?? 0);
const simulations = cold.evaluations + warm.evaluations + review.evaluations;
assert.ok(cold.result.registeredToolNames.length > 0);
assert.equal(cold.result.registeredToolNames.length, cold.result.resolvedToolNames.length);
assert.equal(review.result.failedToolNames.length, 0);

const report = {
  fixture: "Level 1 deterministic two-component draft",
  fixtureCommit: process.env.FAULTLINE_FIXTURE_COMMIT ?? "unknown",
  generatedAt: new Date().toISOString(),
  note: "Baseline captures the current uncached WebMCP surface; generatedAt is report metadata only and is never part of simulator evidence.",
  registration: {
    coldEvaluations: cold.evaluations,
    warmEvaluations: warm.evaluations,
    reviewRecipeEvaluations: review.evaluations,
    registeredToolCount: cold.result.registeredToolNames.length,
    toolMetadataBytes: metadataBytes,
    registrationMs: { cold: registrationSummary(coldEvents), warm: registrationSummary(warmEvents), all: { p50: percentile(registrationMs, 0.5), p95: percentile(registrationMs, 0.95), max: Math.max(...registrationMs) } },
    surfaceBuildMs: { p50: percentile(surfaceBuildMs, 0.5), p95: percentile(surfaceBuildMs, 0.95), max: Math.max(...surfaceBuildMs) },
  },
  reviewRecipe: { calls: 4, names: ["get_coaching_policy", "get_session_focus", "inspect_component", "get_metrics"] },
  repeatedReads: { calls: 10, additionalEvaluations: review.evaluations, resultBytes: { p50: percentile(resultBytes, 0.5), p95: percentile(resultBytes, 0.95), max: Math.max(...resultBytes) } },
  callbackMs: { p50: percentile(callbacks, 0.5), p95: percentile(callbacks, 0.95), max: Math.max(...callbacks) },
  contextSnapshotMs: { p50: percentile(contextSnapshotMs, 0.5), p95: percentile(contextSnapshotMs, 0.95), max: Math.max(...contextSnapshotMs) },
  simulatorEvaluationMs: { p50: percentile(reviewEvents.filter((event) => event.name === "simulator_evaluation_ms").map((event) => event.durationMs ?? 0), 0.5), p95: percentile(reviewEvents.filter((event) => event.name === "simulator_evaluation_ms").map((event) => event.durationMs ?? 0), 0.95), max: Math.max(...reviewEvents.filter((event) => event.name === "simulator_evaluation_ms").map((event) => event.durationMs ?? 0)) },
  totalEvaluations: simulations,
};
console.log(JSON.stringify(report, null, 2));
