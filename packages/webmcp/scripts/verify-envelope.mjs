import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry, WMP_EVIDENCE_CONTRACT_VERSION } from "@faultline/agent-capabilities";
import { toWebMcpTool, validateAgentEvidenceResult } from "../dist/index.js";

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

for (const name of ["review_current_design", "get_metrics", "get_cost_breakdown", "inspect_design_entity", "expand_design_evidence"]) {
  const tool = toWebMcpTool(registry.get(name), { registry, getContext: () => validContext });
  const result = await tool.execute(
    name === "inspect_design_entity" ? { kind: "component", ref: "service-1" } : name === "expand_design_evidence" ? undefined : {},
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
