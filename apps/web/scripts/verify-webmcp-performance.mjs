import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { urlShortenerChallenge, urlShortenerStarterArchitecture } from "@faultline/challenges";
import { registerAgentWebMcpSurface } from "@faultline/webmcp";
import { createAgentContext } from "../lib/agent-context/create-agent-context.ts";

const architecture = urlShortenerStarterArchitecture();

const budget = JSON.parse(await readFile(new URL("./webmcp-performance-budget.json", import.meta.url), "utf8"));

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
    onVisualIntent: () => {},
    onComponentExplanationPresentation: async (command) => ({
      contractVersion: command.contractVersion,
      commandId: command.commandId,
      componentId: command.component.entityId,
      evidenceRevision: command.evidenceRevision,
      appliedSessionRevision: command.sessionRevision + 1,
      annotationStatus: "rendered",
      cameraStatus: "centered",
      appliedZoom: 1.5,
      status: "applied",
    }),
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
const bootstrap = await invoke(review.tools, "review_current_design", { intent: "auto" });
assert.equal(bootstrap.ok, true);
assert.equal(bootstrap.data.state.evidenceRevision, review.result.manifest.revision);
assert.equal(bootstrap.data.provenance.source, "live_draft_projection");
assert.ok(bootstrap.data.next.length > 0);
const component = await invoke(review.tools, "inspect_component", { componentId: "service-start" });
assert.equal(component.ok, true);
const metrics = await invoke(review.tools, "get_metrics");
assert.equal(metrics.ok, true);
for (let index = 0; index < 10; index += 1) await invoke(review.tools, index % 2 ? "get_metrics" : "inspect_component", index % 2 ? {} : { componentId: "service-start" });

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
const phaseMaxima = {
  registration_total_ms: Math.max(...registrationMs),
  surface_build_ms: Math.max(...surfaceBuildMs),
  context_snapshot_ms: Math.max(...contextSnapshotMs),
  capability_execution_ms: Math.max(...reviewEvents.filter((event) => event.name === "capability_execution_ms").map((event) => event.durationMs ?? 0)),
  tool_callback_total_ms: Math.max(...callbacks),
};
const slowestPhase = Object.entries(phaseMaxima).sort(([, left], [, right]) => right - left)[0];
assert.ok(cold.result.registeredToolNames.length > 0);
assert.equal(cold.result.registeredToolNames.length, cold.result.resolvedToolNames.length);
assert.equal(review.result.failedToolNames.length, 0);
const serializedBytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
assert.ok(metadataBytes <= budget.productionMetadataBytesMax, `Production WebMCP metadata is ${metadataBytes} bytes; update the explicit snapshot only for an intentional surface change.`);
assert.ok(serializedBytes(bootstrap) <= budget.bootstrapResultBytesMax, `Bootstrap result exceeds ${budget.bootstrapResultBytesMax} bytes.`);
assert.ok(percentile(callbacks, 0.95) <= budget.warmCallbackP95Ms, `Warm callback p95 exceeded ${budget.warmCallbackP95Ms}ms.`);
assert.ok(review.evaluations <= budget.maxReviewRecipeEvaluations, `Review recipe performed ${review.evaluations} simulator builds.`);

const report = {
  fixture: "Level 1 deterministic fail-first starter",
  fixtureCommit: process.env.FAULTLINE_FIXTURE_COMMIT ?? "unknown",
  generatedAt: new Date().toISOString(),
  note: "Candidate release-gate report; generatedAt is report metadata only and is never part of simulator evidence.",
  registration: {
    coldEvaluations: cold.evaluations,
    warmEvaluations: warm.evaluations,
    reviewRecipeEvaluations: review.evaluations,
    registeredToolCount: cold.result.registeredToolNames.length,
    toolMetadataBytes: metadataBytes,
    registrationMs: { cold: registrationSummary(coldEvents), warm: registrationSummary(warmEvents), all: { p50: percentile(registrationMs, 0.5), p95: percentile(registrationMs, 0.95), max: Math.max(...registrationMs) } },
    surfaceBuildMs: { p50: percentile(surfaceBuildMs, 0.5), p95: percentile(surfaceBuildMs, 0.95), max: Math.max(...surfaceBuildMs) },
  },
  reviewRecipe: { calls: 3, names: ["review_current_design", "inspect_component", "get_metrics"], bootstrapBytes: serializedBytes(bootstrap) },
  repeatedReads: { calls: 10, additionalEvaluations: review.evaluations, resultBytes: { p50: percentile(resultBytes, 0.5), p95: percentile(resultBytes, 0.95), max: Math.max(...resultBytes) } },
  callbackMs: { p50: percentile(callbacks, 0.5), p95: percentile(callbacks, 0.95), max: Math.max(...callbacks) },
  contextSnapshotMs: { p50: percentile(contextSnapshotMs, 0.5), p95: percentile(contextSnapshotMs, 0.95), max: Math.max(...contextSnapshotMs) },
  simulatorEvaluationMs: { p50: percentile(reviewEvents.filter((event) => event.name === "simulator_evaluation_ms").map((event) => event.durationMs ?? 0), 0.5), p95: percentile(reviewEvents.filter((event) => event.name === "simulator_evaluation_ms").map((event) => event.durationMs ?? 0), 0.95), max: Math.max(...reviewEvents.filter((event) => event.name === "simulator_evaluation_ms").map((event) => event.durationMs ?? 0)) },
  slowestPhase: slowestPhase ? { name: slowestPhase[0], maxMs: slowestPhase[1] } : null,
  totalEvaluations: simulations,
};
console.log(JSON.stringify(report, null, 2));
