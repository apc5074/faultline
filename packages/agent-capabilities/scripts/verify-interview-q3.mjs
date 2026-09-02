import assert from "node:assert/strict";
import { buildInterviewScaleQuestion, createInterviewScaleReview, validateInterviewScaleEdit, validateInterviewScaleReview } from "../dist/index.js";

const calibration = { architectureRevision: "rev-1", simulatorVersion: "sim-1", candidates: [{ candidateId: "scale-api", kind: "scale", targetComponentId: "api", targetConfigPath: "instances", primaryReason: "saturated", coachingObjective: "Explain the capacity edit.", recoveryEditClasses: ["scale_capacity"], earlyCareerEditCap: 1 }], witnesses: [{ candidateId: "scale-api", passingConfigPath: "instances", passingValue: 2, hidden: true }] };
const question = buildInterviewScaleQuestion(calibration, "rev-1");
assert.equal(question.targetComponentId, "api");
assert.equal(question.prompt.includes("2"), false);
const before = { version: 1, components: [{ id: "api", type: "service", config: { instances: 1 }, deployments: [], ui: { x: 0, y: 0 } }], connections: [] };
const unrelated = { ...before, components: [{ ...before.components[0], id: "other" }] };
assert.equal(validateInterviewScaleEdit(before, before, question).code, "NO_CHANGE");
assert.equal(validateInterviewScaleEdit(before, unrelated, question).code, "UNSUPPORTED_EDIT");
const after = { ...before, components: [{ ...before.components[0], config: { instances: 2 } }] };
assert.equal(validateInterviewScaleEdit(before, after, question).ok, true);
const review = createInterviewScaleReview({ questionId: question.questionId, candidateId: question.candidateId, evidenceRevision: "rev-1", candidateArchitectureRevision: "rev-2", simulatorRunId: "run-1", targetComponentId: "api", targetCapacityDelta: 2000, passed: true });
assert.equal(validateInterviewScaleReview(review, question, "rev-2").ok, true);
assert.equal(validateInterviewScaleReview({ ...review, candidateArchitectureRevision: "rev-old" }, question, "rev-2").code, "STALE_DIGEST");
assert.equal(validateInterviewScaleReview({ ...review, targetCapacityDelta: 0 }, question, "rev-2").code, "INVALID_REVIEW");
console.log("verify-interview-q3: ok");
