import assert from "node:assert/strict";

import {
  createScopedEntityReference,
  reviewReference,
  selectEvidenceContinuations,
} from "../dist/index.js";
import { urlShortenerChallenge } from "../../challenges/dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    { id: "postgres-1", type: "postgres", config: {}, deployments: [], ui: { x: 1, y: 0 } },
  ],
  connections: [{ id: "service-db", sourceComponentId: "service-1", targetComponentId: "postgres-1", type: "read_write" }],
};
const context = {
  challenge: urlShortenerChallenge,
  architecture,
  simulation: {
    available: true,
    components: {},
    workloadPaths: { redirects: { channelId: "redirects", paths: [], inactiveComponentIds: [] } },
    scenarios: {},
  },
  requirementResults: [{ id: "latency", type: "latency", passed: false, actual: 100, target: 50, operator: "lte", explanation: "too slow" }],
  evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "live-1", simulatorVersion: "sim-1", isStale: false, generatedAt: "fixed" },
};
const surfaceRevision = "surface-1";
const serviceRef = createScopedEntityReference("component", "service-1", "rev-1");
const base = {
  contractVersion: "continuation-1",
  capabilityName: "inspect_component",
  reasonCode: "explain_capacity",
  input: { componentId: serviceRef.ref },
  evidenceRevision: "rev-1",
  surfaceRevision,
  targetRefs: [serviceRef],
};

const selected = selectEvidenceContinuations({
  context,
  evidenceRevision: "rev-1",
  surfaceRevision,
  availableCapabilityNames: new Set(["inspect_component"]),
  candidates: [base, base, { ...base, capabilityName: "get_metrics", input: undefined, reasonCode: "expand_review", targetRefs: undefined }, { ...base, evidenceRevision: "old" }],
});
assert.equal(selected.length, 1);
assert.equal(selected[0]?.input.componentId, serviceRef.ref);

const removed = selectEvidenceContinuations({
  context,
  evidenceRevision: "rev-1",
  surfaceRevision,
  availableCapabilityNames: new Set(),
  candidates: [base],
});
assert.equal(removed.length, 0);

const staleTarget = createScopedEntityReference("component", "deleted", "rev-1");
const stale = selectEvidenceContinuations({
  context,
  evidenceRevision: "rev-1",
  surfaceRevision,
  availableCapabilityNames: new Set(["inspect_component"]),
  candidates: [{ ...base, input: { componentId: staleTarget.ref }, targetRefs: [staleTarget] }],
});
assert.equal(stale.length, 0);
assert.match(reviewReference(context, "auto"), /^wmp-ref-[0-9a-f]+$/);

console.log("verify-evidence-continuations: ok");
