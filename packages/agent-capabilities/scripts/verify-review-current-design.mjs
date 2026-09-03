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
const incompletePathContext = {
  ...context,
  architecture: {
    version: 1,
    components: [
      { id: "service-z", type: "service", config: { instances: 2 }, deployments: [], ui: { x: 0, y: 0 } },
      { id: "cdn-a", type: "cdn", config: {}, deployments: [], ui: { x: 1, y: 1 } },
    ],
    connections: [],
  },
  simulation: {
    available: true,
    components: { "service-z": { metrics: { utilization: 1.2 }, state: "saturated" }, "cdn-a": { metrics: { utilization: 0.2 } } },
    system: { redirectP95Ms: 200, throughputPass: false, minimumHeadroom: 0 },
    workloadPaths: {
      redirects: {
        channelId: "redirects",
        paths: [{ pathId: "redirect-path", componentIds: ["service-z", "cdn-a"], connectionIds: [], status: "failed", failureReason: "saturated" }],
        inactiveComponentIds: [],
      },
    },
  },
  requirementResults: [{ id: "latency", type: "latency", passed: false, actual: 200, target: 50, operator: "lte", explanation: "service-z is the first constrained component" }],
};
const incompletePackets = buildReviewUseCasePackets(incompletePathContext);
assert.deepEqual(incompletePackets.requirement.latency.implicatedComponentIds, ["service-z", "cdn-a"]);
const fallbackFailure = buildReviewCurrentDesignOutput(incompletePathContext, { intent: "requirement_failure" }, { ...session, focus: { kind: "none" } });
assert.equal(fallbackFailure.ok, true);
assert.deepEqual(fallbackFailure.data.requirement.implicatedComponentIds, ["service-z", "cdn-a"]);
assert.deepEqual(fallbackFailure.data.policy.contract, [
  "Use simulator evidence as truth.",
  "Give one finding and one focused question.",
  "Discuss mechanism categories, not specific components to add.",
  "Do not mutate architecture or invent metrics.",
]);
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
const movedOnly = { ...context, architecture: { ...context.architecture, components: [{ ...context.architecture.components[0], ui: { x: 900, y: 900 } }] } };
assert.deepEqual(buildReviewRevisionDelta(context, movedOnly).changedComponentIds, [], "UI-only movement is not semantic evidence");
const deltaResult = buildReviewCurrentDesignOutput({ ...changedContext, reviewDelta: delta, reviewPackets: buildReviewUseCasePackets(changedContext) }, { intent: "auto", knownEvidenceRevision: "fixture" }, session);
assert.equal(deltaResult.ok, true);
assert.deepEqual(deltaResult.data.changeSummary.changedComponentIds, ["service-1"]);
assert.equal(buildReviewCurrentDesignOutput({ ...changedContext, reviewPackets: buildReviewUseCasePackets(changedContext) }, { knownEvidenceRevision: "evicted" }, session).data.deltaUnavailable, "revision_not_retained");
const revisionHintOverview = buildReviewCurrentDesignOutput(context, { knownEvidenceRevision: "fixture" }, { ...session, focus: { kind: "none" } });
assert.equal(revisionHintOverview.ok, true);
assert.ok(revisionHintOverview.data.summary, "deprecated revision-only input must rebuild the requested overview");
assert.equal(revisionHintOverview.data.changeSummary?.noMaterialChange, undefined);
const revisionHintComponent = buildReviewCurrentDesignOutput(context, { intent: "component_review", targetId: "service-1", knownEvidenceRevision: "fixture" }, session);
assert.equal(revisionHintComponent.ok, true);
assert.ok(revisionHintComponent.data.component, "same evidence with a changed target must return targeted evidence");
assert.equal(buildReviewCurrentDesignOutput(context, { intent: "component_review", targetId: "missing" }, session).ok, false);
assert.equal(buildReviewCurrentDesignOutput(context, { intent: "cost_review", targetId: "service-1" }, session).ok, false);
assert.equal(reviewCurrentDesignCapability.annotations.readOnlyHint, true);
console.log("verify-review-current-design: ok");
