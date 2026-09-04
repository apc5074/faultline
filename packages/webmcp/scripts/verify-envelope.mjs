import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry, computeSurfaceRevision, createEmptyAgentSessionState, createScopedEntityReference, validateEvidenceContinuation, WMP_EVIDENCE_CONTRACT_VERSION } from "@faultline/agent-capabilities";
import { toWebMcpTool, validateAgentEvidenceResult, wrapWebMcpEnvelope } from "../dist/index.js";

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

const architecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};

const simulation = {
  available: true,
  components: {
    "service-1": {
      metrics: { incomingRps: 1_000, capacityRps: 2_000, utilization: 0.5, headroom: 0.5 },
    },
  },
};

const validContext = {
  challenge,
  architecture,
  simulation,
  cost: { monthlyTotal: 50_000, lineItems: [{ componentId: "service-1", amount: 50_000 }] },
  evidenceMeta: {
    architectureRevision: "env-rev",
    simulationRunId: "live-env",
    simulatorVersion: "sim-env",
    isStale: false,
    generatedAt: "fixed",
  },
};

const registry = createDefaultCapabilityRegistry();
const surfaceRevision = computeSurfaceRevision(["inspect_component"]);
const scopedRef = createScopedEntityReference("component", "service-1", validContext.evidenceMeta.architectureRevision);

const continuation = {
  contractVersion: "continuation-1",
  capabilityName: "inspect_component",
  reasonCode: "explain_capacity",
  input: { componentId: scopedRef.ref },
  evidenceRevision: validContext.evidenceMeta.architectureRevision,
  surfaceRevision,
  targetRefs: [scopedRef],
};
assert.equal(validateEvidenceContinuation(continuation, validContext.evidenceMeta.architectureRevision, surfaceRevision), true);
assert.equal(validateEvidenceContinuation({ ...continuation, evidenceRevision: "old-revision" }, validContext.evidenceMeta.architectureRevision, surfaceRevision), false);
assert.equal(validateEvidenceContinuation({ ...continuation, input: { componentId: "service-1" } }, validContext.evidenceMeta.architectureRevision, surfaceRevision), false);

const wrapped = wrapWebMcpEnvelope(
  { ok: true, data: { answer: "grounded", suggestedNextTools: [continuation, { ...continuation, evidenceRevision: "old-revision" }] } },
  validContext,
  {
    capabilityName: "review_current_design",
    mode: "read",
    input: {},
    lease: {
      snapshot: { context: validContext, session: createEmptyAgentSessionState() },
      evidenceRevision: validContext.evidenceMeta.architectureRevision,
      surfaceRevision,
      sessionRevision: 0,
      isCurrent: () => true,
    },
    availableToolNames: new Set(["inspect_component"]),
  },
);
assert.equal(wrapped.ok, true);
if (wrapped.ok) {
  assert.equal(wrapped.data.next?.length, 1);
  assert.equal(wrapped.data.next?.[0]?.capabilityName, "inspect_component");
  assert.equal(validateAgentEvidenceResult(wrapped.data), true);
  assert.ok(JSON.stringify(wrapped.data).length < 8_192);
}

let publishedCueCount = 0;
const cueTool = toWebMcpTool(registry.get("inspect_component"), {
  registry,
  getContext: () => validContext,
  onPresentationCue: () => {
    publishedCueCount += 1;
    throw new Error("presentation host unavailable");
  },
});
const cueResult = await cueTool.execute({ componentId: "service-1" }, {});
assert.equal(cueResult.ok, true, "presentation callback failure preserves evidence");
assert.equal(publishedCueCount, 1, "current successful read publishes exactly one cue");

const staleTool = toWebMcpTool(registry.get("inspect_component"), {
  registry,
  getContext: () => ({ ...validContext, evidenceMeta: { ...validContext.evidenceMeta, architectureRevision: "env-rev-2" } }),
});
const staleResult = await staleTool.execute({ componentId: scopedRef.ref }, {});
assert.equal(staleResult.ok, false, "stale continuation target cannot be read as current evidence");

for (const name of ["review_current_design", "get_metrics", "get_cost_breakdown", "inspect_component", "expand_design_evidence"]) {
  const tool = toWebMcpTool(registry.get(name), { registry, getContext: () => validContext });
  const result = await tool.execute(
    name === "inspect_component" ? { componentId: "service-1" } : name === "expand_design_evidence" ? undefined : {},
    {},
  );
  if (name === "expand_design_evidence") continue;
  assert.equal(result.ok, true, name);
  if (result.ok) {
    assert.equal(result.data.contractVersion, WMP_EVIDENCE_CONTRACT_VERSION, name);
    assert.equal(typeof result.data.state.resultDigest, "string", name);
    assert.equal(result.data.provenance.source, "live_draft_projection", name);
    validateAgentEvidenceResult(result.data);
  }
}

const costTool = toWebMcpTool(registry.get("get_cost_breakdown"), {
  registry,
  getContext: () => ({ ...validContext, cost: { monthlyTotal: 90_000, lineItems: [{ componentId: "service-1", amount: 90_000, label: "Player label" }] } }),
});
const cost = await costTool.execute(undefined, {});
assert.equal(cost.ok, true);
if (cost.ok) {
  const lineItem = cost.data.data.lineItems[0];
  assert.equal(lineItem.playerAuthored.label, "Player label");
  assert.equal(typeof lineItem.monthlyCost, "object");
  assert.equal(lineItem.monthlyCost.unit, "usd_per_month");
}

console.log("verify-envelope: ok");
