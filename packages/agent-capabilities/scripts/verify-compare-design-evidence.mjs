import assert from "node:assert/strict";

import { urlShortenerChallenge } from "../../challenges/dist/index.js";
import {
  buildReviewRevisionDelta,
  compareDesignEvidence,
  compareDesignEvidenceCapability,
  createDefaultCapabilityRegistry,
} from "../dist/index.js";

const baseArchitecture = {
  version: 1,
  components: [
    { id: "service-1", type: "service", config: { instances: 2 }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "postgres-1", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 1, y: 0 } },
  ],
  connections: [
    { id: "svc-pg", sourceComponentId: "service-1", sourcePortId: "db", targetComponentId: "postgres-1", targetPortId: "db", type: "read_write" },
  ],
};

function contextFor(architecture, revision, runId, requirementResults, cost, scenarios) {
  return {
    challenge: urlShortenerChallenge,
    architecture,
    simulation: {
      available: true,
      components: {
        "service-1": { metrics: { incomingRps: 4000, utilization: 0.7 } },
        "postgres-1": { metrics: { readUtilization: 0.5, writeUtilization: 0.4 } },
      },
      system: { redirectP95Ms: 80, throughputPass: true, minimumHeadroom: 0.2 },
      scenarios: scenarios ?? { hotKey: { active: false, passed: true } },
      workloadPaths: {
        redirects: {
          channelId: "redirects",
          paths: [{ pathId: "redirect-path", componentIds: ["service-1", "postgres-1"], connectionIds: ["svc-pg"], status: "complete" }],
          inactiveComponentIds: [],
        },
      },
    },
    cost: cost ?? { monthlyTotal: 10000, lineItems: [{ componentId: "service-1", amount: 6000 }, { componentId: "postgres-1", amount: 4000 }] },
    requirementResults: requirementResults ?? [{ id: "latency", type: "latency", passed: true, actual: 80, target: 100, operator: "lte", explanation: "ok" }],
    evidenceMeta: { architectureRevision: revision, simulationRunId: runId, simulatorVersion: "test", isStale: false, generatedAt: "fixed" },
  };
}

const previousArchitecture = {
  ...baseArchitecture,
  components: [{ ...baseArchitecture.components[0], config: { instances: 1 } }, baseArchitecture.components[1]],
};
const previousContext = contextFor(
  previousArchitecture,
  "rev-previous",
  "live-previous",
  [{ id: "latency", type: "latency", passed: false, actual: 120, target: 100, operator: "lte", explanation: "slow" }],
  { monthlyTotal: 12000, lineItems: [{ componentId: "service-1", amount: 8000 }, { componentId: "postgres-1", amount: 4000 }] },
);
const currentContext = contextFor(baseArchitecture, "rev-current", "live-current");
const playerRunContext = contextFor(baseArchitecture, "rev-current", "run-player-key");

const withPreviousReview = {
  ...currentContext,
  comparisonBaselines: { previousReview: previousContext },
};
const previousReview = compareDesignEvidence(withPreviousReview, { baseline: "previous_review" });
assert.equal(previousReview.ok, true);
if (previousReview.ok) {
  assert.equal(previousReview.data.baseline, "previous_review");
  assert.equal(previousReview.data.current.source, "live_draft_projection");
  assert.equal(previousReview.data.baselineSide.source, "live_draft_projection");
  assert.deepEqual(previousReview.data.changes.changedComponentIds, ["service-1"]);
  assert.ok(previousReview.data.improvements.includes("requirement:latency:passed"));
  assert.ok(previousReview.data.improvements.includes("cost:decreased"));
  assert.ok(JSON.stringify(previousReview.data).length <= 4096);
}

const independentDelta = buildReviewRevisionDelta(previousContext, currentContext);
assert.deepEqual(previousReview.ok ? previousReview.data.changes.changedComponentIds : [], independentDelta.changedComponentIds);

const withPlayerRun = {
  ...currentContext,
  architecture: { ...baseArchitecture, components: [{ ...baseArchitecture.components[0], config: { instances: 3 } }, baseArchitecture.components[1]] },
  comparisonBaselines: { lastPlayerRun: playerRunContext },
};
const againstRun = compareDesignEvidence(withPlayerRun, { baseline: "last_player_run" });
assert.equal(againstRun.ok, true);
if (againstRun.ok) {
  assert.equal(againstRun.data.baselineSide.source, "player_run");
  assert.equal(againstRun.data.baselineSide.simulationRunId, "run-player-key");
  assert.equal(againstRun.data.current.source, "live_draft_projection");
}

const missingBaseline = compareDesignEvidence(currentContext, { baseline: "previous_review" });
assert.equal(missingBaseline.ok, false);
if (!missingBaseline.ok) assert.match(missingBaseline.message, /not_retained/);

const scenarioBefore = contextFor(baseArchitecture, "rev-a", "live-a", undefined, undefined, { hotKey: { active: true, passed: false } });
const scenarioAfter = contextFor(baseArchitecture, "rev-b", "live-b", undefined, undefined, { hotKey: { active: true, passed: true } });
const scenarioCompare = compareDesignEvidence(
  { ...scenarioAfter, comparisonBaselines: { previousReview: scenarioBefore } },
  { baseline: "authored_scenario", scenarioId: "hot_key" },
);
assert.equal(scenarioCompare.ok, true);
if (scenarioCompare.ok) {
  assert.equal(scenarioCompare.data.changes.scenarioId, "hot_key");
  assert.equal(scenarioCompare.data.changes.before.passed, false);
  assert.equal(scenarioCompare.data.changes.after.passed, true);
}

const entityScope = compareDesignEvidence(withPreviousReview, { baseline: "previous_review", scope: "entity", targetRef: "service-1" });
assert.equal(entityScope.ok, true);
if (entityScope.ok) {
  assert.equal(entityScope.data.changes.entityId, "service-1");
  assert.deepEqual(entityScope.data.changes.structural.changedComponentIds, ["service-1"]);
}

assert.equal(compareDesignEvidenceCapability.annotations.readOnlyHint, true);
const registry = createDefaultCapabilityRegistry();
assert.ok(registry.has("compare_design_evidence"));
const invoked = await registry.invoke("compare_design_evidence", withPreviousReview, { baseline: "previous_review" });
assert.equal(invoked.ok, true);

console.log("verify-compare-design-evidence: ok");
