import assert from "node:assert/strict";

import {
  computeSurfaceRevision,
  createDefaultCapabilityRegistry,
  createEmptyAgentSessionState,
  createScopedEntityReference,
  selectEvidenceContinuations,
  validateAgentEvidenceResult,
} from "@faultline/agent-capabilities";
import { toWebMcpTool, wrapWebMcpEnvelope } from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    { id: "postgres-1", type: "postgres", config: {}, deployments: [], ui: { x: 1, y: 0 } },
  ],
  connections: [{ id: "service-db", sourceComponentId: "service-1", targetComponentId: "postgres-1", type: "read_write" }],
};
const context = {
  challenge: { slug: "fixture", version: 1, title: "Fixture", prompt: "Design", developmentOnly: true, workload: { requestsPerSecond: 1, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 100, allowedComponentTypes: ["service", "postgres"] },
  architecture,
  simulation: { available: true, components: {}, workloadPaths: { redirects: { channelId: "redirects", paths: [], inactiveComponentIds: [] } }, scenarios: {} },
  evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "live-1", simulatorVersion: "sim-1", isStale: false, generatedAt: "fixed" },
};
const surfaceRevision = computeSurfaceRevision(["inspect_component", "inspect_design_entity"]);
const serviceRef = createScopedEntityReference("component", "service-1", "rev-1");
const connectionRef = createScopedEntityReference("connection", "service-db", "rev-1");
const candidates = [
  {
    contractVersion: "continuation-1", capabilityName: "inspect_component", reasonCode: "inspect_subject",
    input: { componentId: serviceRef.ref }, evidenceRevision: "rev-1", surfaceRevision, targetRefs: [serviceRef],
  },
  {
    contractVersion: "continuation-1", capabilityName: "inspect_design_entity", reasonCode: "inspect_connection",
    input: { kind: "connection", ref: connectionRef.ref }, evidenceRevision: "rev-1", surfaceRevision, targetRefs: [connectionRef],
  },
];

const selected = selectEvidenceContinuations({
  candidates,
  context,
  evidenceRevision: "rev-1",
  surfaceRevision,
  availableCapabilityNames: new Set(["inspect_component", "inspect_design_entity"]),
});
assert.equal(selected.length, 2);
assert.equal(selected[0]?.input.componentId, serviceRef.ref);
assert.equal(selected[1]?.input.ref, connectionRef.ref);

const wrapped = wrapWebMcpEnvelope(
  { ok: true, data: { finding: "fixture", suggestedNextTools: candidates } },
  context,
  {
    capabilityName: "review_current_design", mode: "read", input: {},
    lease: { snapshot: { context, session: createEmptyAgentSessionState() }, evidenceRevision: "rev-1", surfaceRevision, sessionRevision: 0, isCurrent: () => true },
    availableToolNames: new Set(["inspect_component", "inspect_design_entity"]),
  },
);
assert.equal(wrapped.ok, true);
if (wrapped.ok) {
  assert.equal(wrapped.data.next?.length, 2);
  assert.equal(validateAgentEvidenceResult(wrapped.data), true);
  assert.equal(wrapped.data.data.finding, "fixture");
  assert.ok(JSON.stringify(wrapped.data).length < 8_192);
}

const registry = createDefaultCapabilityRegistry();
const inspectComponent = toWebMcpTool(registry.get("inspect_component"), { registry, getContext: () => context });
const continued = await inspectComponent.execute({ componentId: serviceRef.ref }, {});
assert.equal(continued.ok, true, "destination accepts the exact scoped component input");
const stale = await inspectComponent.execute({ componentId: createScopedEntityReference("component", "service-1", "rev-2").ref }, {});
assert.equal(stale.ok, false, "stale target is rejected without substitution");

const removed = selectEvidenceContinuations({
  candidates,
  context,
  evidenceRevision: "rev-1",
  surfaceRevision,
  availableCapabilityNames: new Set(["inspect_component"]),
});
assert.equal(removed.length, 1);
assert.equal(removed[0]?.capabilityName, "inspect_component");

const invalid = selectEvidenceContinuations({
  candidates: [{ ...candidates[0], input: { componentId: "not-the-scoped-ref" } }],
  context,
  evidenceRevision: "rev-1",
  surfaceRevision,
  availableCapabilityNames: new Set(["inspect_component"]),
});
assert.equal(invalid.length, 0, "schema and reference mismatch is filtered");

console.log("verify-continuation-acceptance: ok");
