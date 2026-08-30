import assert from "node:assert/strict";
import { urlShortenerChallenge } from "../../challenges/dist/index.js";
import { buildReviewCurrentDesignOutput, reviewCurrentDesignCapability } from "../dist/index.js";

const architecture = { version: 1, components: [{ id: "service-1", type: "service", config: { instances: 2 }, deployments: [], ui: { x: 1, y: 1 } }], connections: [] };
const context = {
  challenge: urlShortenerChallenge,
  architecture,
  simulation: { available: true, components: { "service-1": { metrics: { utilization: 0.8 } } }, system: { redirectP95Ms: 90, throughputPass: false, minimumHeadroom: 0.1 }, workloadPaths: { redirects: { channelId: "redirects", paths: [{ pathId: "redirect-path", componentIds: ["service-1"], connectionIds: [], status: "complete" }], inactiveComponentIds: [] } } },
  cost: { monthlyTotal: 10, lineItems: [{ componentId: "service-1", amount: 10 }] },
  requirementResults: [{ id: "latency", type: "latency", passed: false, actual: 90, target: 50, operator: "lte", explanation: "latency exceeds target" }],
  evidenceMeta: { architectureRevision: "fixture", simulationRunId: "live-test", simulatorVersion: "test", isStale: false, generatedAt: "fixed" },
};
const session = { focus: { kind: "component", componentId: "service-1", source: "selection" }, pendingHelpRequest: null, annotations: [], experimentConsent: null, revision: 4 };
for (const [intent, targetId] of [["component_review", "service-1"], ["requirement_failure", "latency"], ["workload_trace", "redirects"], ["cost_review", undefined]]) {
  const result = buildReviewCurrentDesignOutput(context, { intent, ...(targetId ? { targetId } : {}) }, session);
  assert.equal(result.ok, true);
  assert.ok(JSON.stringify(result.data).length <= 8192);
  assert.equal(result.data.evidence.source, "live_draft_projection");
}
const auto = buildReviewCurrentDesignOutput(context, {}, { ...session, focus: { kind: "none" } });
assert.equal(auto.ok, true);
assert.ok(auto.data.summary);
assert.equal(buildReviewCurrentDesignOutput(context, { intent: "component_review", targetId: "missing" }, session).ok, false);
assert.equal(buildReviewCurrentDesignOutput(context, { intent: "cost_review", targetId: "service-1" }, session).ok, false);
assert.equal(reviewCurrentDesignCapability.annotations.readOnlyHint, true);
console.log("verify-review-current-design: ok");
