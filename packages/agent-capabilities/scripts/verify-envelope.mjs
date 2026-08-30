import assert from "node:assert/strict";

import { urlShortenerChallenge } from "../../challenges/dist/index.js";
import {
  buildReviewCurrentDesignOutput,
  computeSurfaceRevision,
  createScopedEntityReference,
  createDefaultCapabilityRegistry,
  inspectComponent,
  reviewReference,
  validateAgentEvidenceResult,
  WMP_EVIDENCE_CONTRACT_VERSION,
} from "../dist/index.js";
import { toWebMcpTool } from "../../webmcp/dist/to-webmcp-tool.js";

const architecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: { instances: 2, label: "Primary API" }, deployments: [], ui: { x: 1, y: 1 } }],
  connections: [],
};
const context = {
  challenge: urlShortenerChallenge,
  architecture,
  simulation: {
    available: true,
    components: { "service-1": { metrics: { incomingRps: 4000, utilization: 0.8 } } },
    system: { redirectP95Ms: 90, throughputPass: false, minimumHeadroom: 0.1 },
    workloadPaths: { redirects: { channelId: "redirects", paths: [{ pathId: "redirect-path", componentIds: ["service-1"], connectionIds: [], status: "complete" }], inactiveComponentIds: [] } },
  },
  cost: { monthlyTotal: 10, lineItems: [{ componentId: "service-1", amount: 10 }] },
  requirementResults: [{ id: "latency", type: "latency", passed: false, actual: 90, target: 50, operator: "lte", explanation: "latency exceeds target" }],
  evidenceMeta: { architectureRevision: "fixture-rev", simulationRunId: "live-test", simulatorVersion: "test-sim", isStale: false, generatedAt: "fixed" },
};
const session = { focus: { kind: "component", componentId: "service-1", source: "selection" }, pendingHelpRequest: null, annotations: [], experimentConsent: null, revision: 4 };

const review = buildReviewCurrentDesignOutput(context, { intent: "component_review", targetId: "service-1" }, session, "surface-a");
assert.equal(review.ok, true);

const registry = createDefaultCapabilityRegistry();
const toolNames = ["review_current_design", "expand_design_evidence"];
const surfaceRevision = computeSurfaceRevision(toolNames);
const tool = toWebMcpTool(registry.get("review_current_design"), {
  registry,
  getContext: () => ({ context, session }),
  surfaceRevision,
  availableToolNames: new Set(toolNames),
});
const enveloped = await tool.execute({ intent: "component_review", targetId: "service-1" }, {});
assert.equal(enveloped.ok, true);
if (enveloped.ok) {
  assert.equal(enveloped.data.contractVersion, WMP_EVIDENCE_CONTRACT_VERSION);
  assert.equal(enveloped.data.provenance.source, "live_draft_projection");
  assert.equal(enveloped.data.provenance.simulatorVersion, "test-sim");
  assert.equal(typeof enveloped.data.state.resultDigest, "string");
  assert.equal(enveloped.data.state.evidenceRevision, "fixture-rev");
  assert.equal(enveloped.data.state.sessionRevision, 4);
  assert.equal("evidence" in enveloped.data.data, false);
  assert.ok(enveloped.data.next === undefined || Array.isArray(enveloped.data.next));
  validateAgentEvidenceResult(enveloped.data);
}

const metricsTool = toWebMcpTool(registry.get("get_metrics"), { registry, getContext: () => context });
const metrics = await metricsTool.execute(undefined, {});
assert.equal(metrics.ok, true);
if (metrics.ok) {
  const system = metrics.data.data.system;
  assert.equal(system.redirectP95Ms.unit, "ms");
  assert.equal(system.minimumHeadroom.unit, "ratio");
}

const inspectTool = toWebMcpTool(registry.get("inspect_component"), { registry, getContext: () => context });
const inspected = await inspectTool.execute({ componentId: "service-1" }, {});
assert.equal(inspected.ok, true);
if (inspected.ok) {
  assert.ok("facts" in inspected.data.data);
}

const scopedRef = createScopedEntityReference("component", "service-1", context.evidenceMeta.architectureRevision);
assert.equal(scopedRef.kind, "component");
assert.equal(scopedRef.entityId, "service-1");
assert.equal(inspectComponent(context, { componentId: scopedRef.ref }).ok, true);
const staleRef = createScopedEntityReference("component", "service-1", "old-revision");
assert.equal(inspectComponent(context, { componentId: staleRef.ref }).ok, false);

const fullReview = buildReviewCurrentDesignOutput(context, { intent: "auto" }, session, "surface-a");
assert.equal(fullReview.ok, true);
if (fullReview.ok && !("unchanged" in fullReview.data)) {
  const first = await tool.execute({ intent: "auto" }, {});
  assert.equal(first.ok, true);
  const unchanged = await tool.execute({ intent: "auto", knownState: first.data.state }, {});
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.data.data.unchanged, true);
}

assert.equal(reviewReference(context, "auto").startsWith("wmp-ref-"), true);
assert.match(reviewReference(context, "auto"), /wmp-ref-[0-9a-f]+/);

console.log("verify-envelope: ok");
