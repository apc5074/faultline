import assert from "node:assert/strict";
import { INTERVIEW_V2_SKIP_LIVE_SCALE, preflightInterviewV2 } from "../dist/index.js";

const base = {
  challenge: { slug: "url-shortener", version: 3, title: "URL", prompt: "Design", developmentOnly: false, workload: { requestsPerSecond: 10, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 10, allowedComponentTypes: ["service", "cache", "traffic-source"] },
  architecture: {
    version: 1,
    components: [
      { id: "traffic-source-start", type: "traffic-source", config: {}, deployments: [], ui: { x: 0, y: 0 } },
      { id: "service-start", type: "service", config: { instances: 1 }, deployments: [], ui: { x: 1, y: 0 } },
      { id: "cache-added", type: "cache", config: {}, deployments: [], ui: { x: 2, y: 0 } },
    ],
    connections: [
      { id: "c1", sourceComponentId: "traffic-source-start", sourcePortId: "out", targetComponentId: "service-start", targetPortId: "in", type: "request" },
      { id: "c2", sourceComponentId: "service-start", sourcePortId: "out", targetComponentId: "cache-added", targetPortId: "in", type: "request" },
    ],
  },
  evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "run-1", simulatorVersion: "sim-1", isStale: false, generatedAt: "fixed" },
  simulation: {
    available: true,
    components: {},
    workloadPaths: {
      redirects: {
        channelId: "redirects",
        paths: [{ pathId: "path-1", componentIds: ["traffic-source-start", "service-start", "cache-added"], connectionIds: ["c1", "c2"], status: "complete" }],
        inactiveComponentIds: [],
      },
    },
  },
};

const curriculum = {
  edgeCaseCards: [{
    id: "viral-short-code-hot-key",
    setting: "One short code receives 25% of redirect traffic.",
    promptCore: "One URL suddenly receives 25% of all traffic. How does your current system behave?",
    expectedTopics: ["request path", "cache concentration"],
    acceptableTradeoffs: ["edge offload versus freshness"],
    commonMisconceptions: ["aggregate throughput alone proves the hot key is safe"],
    allowedProbeAngles: ["trace the hot request"],
    difficulty: "early_career",
  }],
  settingFacts: ["Six regions share redirects."],
};

const calibration = {
  architectureRevision: "rev-1",
  simulatorVersion: "sim-1",
  candidates: [
    { candidateId: "scale-service-start", kind: "scale", targetComponentId: "service-start", targetConfigPath: "instances", primaryReason: "saturated", coachingObjective: "Scale.", recoveryEditClasses: ["scale_capacity"], earlyCareerEditCap: 1 },
    { candidateId: "failure-service-start", kind: "failure", targetComponentId: "service-start", failureScope: "component", primaryReason: "outage", coachingObjective: "Recover.", recoveryEditClasses: ["scale_capacity", "add_redundancy"], earlyCareerEditCap: 1 },
  ],
  witnesses: [],
};

const ready = preflightInterviewV2({
  context: base,
  starterComponentIds: ["traffic-source-start", "service-start"],
  componentCards: { cache: { type: "cache", placementIntent: "near reads" } },
  curriculum,
  calibration,
});
assert.equal(ready.ok, true);
if (ready.ok) {
  assert.equal(ready.questions.length, INTERVIEW_V2_SKIP_LIVE_SCALE ? 4 : 5);
  assert.equal(ready.questions[0].slotId, "request-path-v2");
  assert.equal(ready.questions[0].assessment.slotId, "request-path-v2");
  assert.equal(ready.questions[1].slotId, "component-justification-v2");
  if (INTERVIEW_V2_SKIP_LIVE_SCALE) {
    assert.equal(ready.questions[2].slotId, "challenge-edge-case-v2");
    assert.equal(ready.questions[3].kind, "live_failure");
    assert.equal(ready.questions[3].assessment.slotId, "live-failure-v2");
    assert.equal(ready.questions[3].targetComponentId, "service-start");
    assert.equal(ready.questions[3].calibrationId, undefined);
  } else {
    assert.equal(ready.questions[2].kind, "live_scale");
    assert.equal(ready.questions[3].slotId, "challenge-edge-case-v2");
    assert.equal(ready.questions[4].kind, "live_failure");
    assert.equal(ready.questions[4].assessment.slotId, "live-failure-v2");
    assert.equal(ready.questions[4].targetComponentId, "service-start");
  }
}

const missingPlayer = preflightInterviewV2({
  context: { ...base, architecture: { ...base.architecture, components: base.architecture.components.slice(0, 2), connections: [base.architecture.connections[0]] }, simulation: { available: true, components: {}, workloadPaths: { redirects: { channelId: "redirects", paths: [{ pathId: "path-1", componentIds: ["traffic-source-start", "service-start"], connectionIds: ["c1"], status: "complete" }], inactiveComponentIds: [] } } } },
  starterComponentIds: ["traffic-source-start", "service-start"],
  componentCards: { cache: { type: "cache", placementIntent: "near reads" } },
  curriculum,
  calibration,
});
assert.equal(missingPlayer.ok, false);
assert.equal(missingPlayer.code, "PREPARATION_REQUIRED");

const noScale = preflightInterviewV2({
  context: base,
  starterComponentIds: ["traffic-source-start", "service-start"],
  componentCards: { cache: { type: "cache", placementIntent: "near reads" } },
  curriculum,
  calibration: { ...calibration, candidates: calibration.candidates.filter((candidate) => candidate.kind !== "scale") },
});
if (INTERVIEW_V2_SKIP_LIVE_SCALE) {
  assert.equal(noScale.ok, true);
} else {
  assert.equal(noScale.ok, false);
  assert.equal(noScale.code, "PREPARATION_REQUIRED");
}

console.log("verify-interview-v2-preflight: ok");
