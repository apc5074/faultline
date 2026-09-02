import assert from "node:assert/strict";
import { buildInterviewFailureQuestion, createInterviewCompletionSummary, createInterviewFailureReview, failureReviewCanAdvance, validateInterviewFailureReview } from "../dist/index.js";

const calibration = { architectureRevision: "rev-1", simulatorVersion: "sim-1", candidates: [{ candidateId: "failure-api", kind: "failure", targetComponentId: "api", failureScope: "component", primaryReason: "service outage", coachingObjective: "Explain bounded recovery.", recoveryEditClasses: ["add_redundancy", "reroute_traffic"], earlyCareerEditCap: 2 }], witnesses: [] };
const question = buildInterviewFailureQuestion(calibration, "rev-1", undefined, {
  version: 1,
  components: [{ id: "api", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
});
assert.equal(question.failureScope, "component");
assert.equal(question.targetComponentType, "service");
assert.equal(question.earlyCareerEditCap, 2);
assert.match(question.prompt, /service outage/i);
assert.match(question.prompt, /chat only/i);
assert.doesNotMatch(question.prompt, /edit the canvas/i);
assert.ok(question.evidenceSummary.some((line) => /chat only/i.test(line)));
const failed = createInterviewFailureReview({ questionId: question.questionId, candidateId: question.candidateId, evidenceRevision: "rev-1", candidateArchitectureRevision: "rev-2", simulatorRunId: "run-1", targetComponentId: "api", observedFailure: "The service stopped serving requests.", recoveryEditClasses: ["reroute_traffic"], recoveryEditCount: 1, passed: false });
assert.equal(failureReviewCanAdvance(failed, question, "rev-2"), false);
const passed = createInterviewFailureReview({ ...failed, passed: true, reviewDigest: undefined, simulated: undefined, official: undefined });
assert.equal(failureReviewCanAdvance(passed, question, "rev-2"), true);
assert.equal(validateInterviewFailureReview({ ...passed, recoveryEditCount: 3 }, question, "rev-2").code, "INVALID_REVIEW");
assert.equal(validateInterviewFailureReview({ ...passed, candidateArchitectureRevision: "old" }, question, "rev-2").code, "STALE_DIGEST");
assert.deepEqual(createInterviewCompletionSummary(["Clear path reasoning", "Grounded tradeoff analysis"], "Practice failure isolation"), { strengths: ["Clear path reasoning", "Grounded tradeoff analysis"], nextPracticeArea: "Practice failure isolation", official: false });
assert.throws(() => createInterviewCompletionSummary(["only one"], "next"));
console.log("verify-interview-q5: ok");
