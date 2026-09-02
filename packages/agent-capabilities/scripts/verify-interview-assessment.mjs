import assert from "node:assert/strict";
import {
  assessmentFromComponentJustification,
  assessmentFromEdgeCase,
  assessmentFromFailureQuestion,
  assessmentFromRequestPathQuestion,
  buildInterviewFailureQuestion,
  buildRequestPathQuestion,
  resolveInterviewAssessment,
  selectInterviewEdgeCase,
  selectPlayerAddedComponentQuestion,
} from "../dist/index.js";

const base = {
  challenge: { slug: "url-shortener", version: 3, title: "URL", prompt: "Design", developmentOnly: false, workload: { requestsPerSecond: 10, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 10, allowedComponentTypes: ["service", "cache"] },
  architecture: { version: 1, components: [
    { id: "service-start", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    { id: "cache-added", type: "cache", config: {}, deployments: [], ui: { x: 1, y: 0 } },
  ], connections: [{ id: "edge-1", sourceComponentId: "service-start", sourcePortId: "out", targetComponentId: "cache-added", targetPortId: "in", type: "request" }] },
  evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "run-1", simulatorVersion: "sim-1", isStale: false, generatedAt: "fixed" },
  simulation: { available: true, components: {}, workloadPaths: { redirects: { channelId: "redirects", paths: [{ pathId: "path-1", componentIds: ["service-start", "cache-added"], connectionIds: ["edge-1"], status: "complete" }], inactiveComponentIds: [] } } },
};

const q1 = assessmentFromRequestPathQuestion(buildRequestPathQuestion(base));
assert.equal(q1.slotId, "request-path-v2");
assert.ok(q1.requiredTopics.includes("request path"));
assert.ok(q1.evidenceSummary.some((line) => /Components:/.test(line)));
assert.match(q1.assessGuidance, /requiredTopics/);

const q2Question = selectPlayerAddedComponentQuestion({ context: base, starterComponentIds: ["service-start"], componentCards: { cache: { type: "cache", placementIntent: "near reads" } } });
const q2 = assessmentFromComponentJustification(q2Question);
assert.equal(q2.slotId, "component-justification-v2");
assert.deepEqual(q2.requiredTopics, q2Question.rubric.requiredTopics);
assert.ok(q2.evidenceSummary.some((line) => /cache-added/.test(line)));

const q4Question = selectInterviewEdgeCase({
  curriculum: {
    settingFacts: ["Six regions share 120k redirects per second."],
    edgeCaseCards: [{
      id: "viral-short-code-hot-key",
      setting: "One short code receives 25% of redirect traffic.",
      promptCore: "One URL suddenly receives 25% of all traffic. How does your current system behave?",
      expectedTopics: ["request path", "cache concentration", "hot-key pressure"],
      acceptableTradeoffs: ["edge offload versus freshness"],
      commonMisconceptions: ["aggregate throughput alone proves the hot key is safe"],
      allowedProbeAngles: ["trace the hot request"],
      difficulty: "early_career",
    }],
  },
  evidenceRevision: "rev-1",
});
const q4 = assessmentFromEdgeCase(q4Question);
assert.equal(q4.slotId, "challenge-edge-case-v2");
assert.deepEqual(q4.requiredTopics, q4Question.rubric.requiredTopics);
assert.deepEqual(q4.acceptableTradeoffs, q4Question.rubric.acceptableTradeoffs);

const q5Question = buildInterviewFailureQuestion({
  architectureRevision: "rev-1",
  simulatorVersion: "sim-1",
  candidates: [{
    candidateId: "failure-service-start",
    kind: "failure",
    targetComponentId: "service-start",
    failureScope: "component",
    primaryReason: "service outage",
    coachingObjective: "Explain recovery.",
    recoveryEditClasses: ["add_redundancy"],
    earlyCareerEditCap: 2,
  }],
  witnesses: [],
}, "rev-1", undefined, base.architecture);
const q5 = assessmentFromFailureQuestion(q5Question);
assert.equal(q5.slotId, "live-failure-v2");
assert.ok(q5.requiredTopics.includes("recovery approach"));
assert.ok(q5.evidenceSummary.some((line) => /service-start/.test(line)));
assert.match(q5.assessGuidance, /Do not require canvas edits/i);

const opening = resolveInterviewAssessment(base, {
  kind: "discussion",
  questionId: "opening-1",
  ordinal: 1,
  phase: "opening",
  prompt: "Trace the path.",
  componentIds: [],
  grouped: false,
});
assert.equal(opening?.slotId, "request-path-v2");
const component = resolveInterviewAssessment(base, {
  kind: "component",
  questionId: "component-cache-added",
  ordinal: 5,
  phase: "component",
  prompt: "Why cache?",
  componentIds: ["cache-added"],
  grouped: false,
});
assert.equal(component?.slotId, "component-justification-v2");
assert.equal(resolveInterviewAssessment(base, {
  kind: "simulation",
  questionId: "simulation-traffic-double-v1",
  ordinal: 9,
  phase: "simulation",
  prompt: "Double traffic.",
  scenario: { type: "traffic_multiplier", parameters: { multiplier: 2 } },
  sourceChallengeId: "url-shortener",
  baselineArchitectureRevision: "rev-1",
  componentIds: [],
  grouped: false,
}), undefined);

console.log("verify-interview-assessment: ok");
