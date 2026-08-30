import assert from "node:assert/strict";
import { urlShortenerChallenge } from "../../challenges/dist/index.js";
import { buildReviewCurrentDesignOutput, buildReviewRevisionDelta, buildReviewUseCasePackets, expandDesignEvidence, reviewCurrentDesignCapability } from "../dist/index.js";

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
const packets = buildReviewUseCasePackets(context);
assert.ok(packets.overview.failedRequirements.some((requirement) => requirement.id === "latency"));
assert.ok(packets.component["service-1"]);
assert.equal(packets.requirement.latency.result.actual, 90);
assert.ok(packets.workload.redirects.channel.paths.length > 0);
assert.equal(packets.cost.monthlyTotal, 10);
for (const [intent, targetId] of [["component_review", "service-1"], ["requirement_failure", "latency"], ["workload_trace", "redirects"], ["cost_review", undefined]]) {
  const result = buildReviewCurrentDesignOutput(context, { intent, ...(targetId ? { targetId } : {}) }, session);
  assert.equal(result.ok, true);
  assert.ok(JSON.stringify(result.data).length <= 8192);
  assert.equal(result.data.evidence.source, "live_draft_projection");
}
const auto = buildReviewCurrentDesignOutput(context, {}, { ...session, focus: { kind: "none" } });
assert.equal(auto.ok, true);
assert.ok(auto.data.summary);
const packetContext = { ...context, reviewPackets: packets };
for (const [intent, targetId] of [["component_review", "service-1"], ["requirement_failure", "latency"], ["workload_trace", "redirects"], ["cost_review", undefined]]) {
  const result = buildReviewCurrentDesignOutput(packetContext, { intent, ...(targetId ? { targetId } : {}) }, session);
  assert.equal(result.ok, true);
}
const packetReview = buildReviewCurrentDesignOutput(packetContext, { intent: "auto" }, { ...session, focus: { kind: "none" } });
assert.equal(packetReview.ok, true);
const expanded = expandDesignEvidence(packetContext, { reviewRef: packetReview.data.reviewRef, sections: ["causal_chain", "requirement_evidence"] });
assert.equal(expanded.ok, true);
assert.ok(expanded.data.sections.causal_chain);
assert.equal(expandDesignEvidence(packetContext, { reviewRef: "forged", sections: ["causal_chain"] }).ok, false);
const changedContext = { ...context, evidenceMeta: { ...context.evidenceMeta, architectureRevision: "next" }, architecture: { ...context.architecture, components: [{ ...context.architecture.components[0], config: { instances: 3 } }] } };
const delta = buildReviewRevisionDelta(context, changedContext);
const deltaResult = buildReviewCurrentDesignOutput({ ...changedContext, reviewDelta: delta, reviewPackets: buildReviewUseCasePackets(changedContext) }, { intent: "auto", knownEvidenceRevision: "fixture" }, session);
assert.equal(deltaResult.ok, true);
assert.deepEqual(deltaResult.data.changeSummary.changedComponentIds, ["service-1"]);
assert.equal(buildReviewCurrentDesignOutput({ ...changedContext, reviewPackets: buildReviewUseCasePackets(changedContext) }, { knownEvidenceRevision: "evicted" }, session).data.deltaUnavailable, "revision_not_retained");
assert.equal(buildReviewCurrentDesignOutput(context, { knownEvidenceRevision: "fixture" }, session).data.changeSummary.noMaterialChange, true);
assert.equal(buildReviewCurrentDesignOutput(context, { intent: "component_review", targetId: "missing" }, session).ok, false);
assert.equal(buildReviewCurrentDesignOutput(context, { intent: "cost_review", targetId: "service-1" }, session).ok, false);
assert.equal(reviewCurrentDesignCapability.annotations.readOnlyHint, true);
console.log("verify-review-current-design: ok");
