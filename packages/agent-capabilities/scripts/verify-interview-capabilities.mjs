import assert from "node:assert/strict";
import {
  DESIGN_INTERVIEW_CAPABILITIES,
  createDefaultCapabilityRegistry,
  startDesignInterviewCapability,
} from "../dist/index.js";

const registry = createDefaultCapabilityRegistry();
const expected = [
  "start_design_interview",
  "get_design_interview",
  "submit_interview_answer",
  "follow_up_design_interview",
  "advance_design_interview",
  "end_design_interview",
];
assert.deepEqual(DESIGN_INTERVIEW_CAPABILITIES.map((capability) => capability.name), expected.slice(1));
assert.equal(startDesignInterviewCapability.mode, "session");
for (const name of expected) {
  assert.equal(registry.has(name), true, `${name} must be registered`);
  assert.equal(registry.get(name).mode === "session" || name === "get_design_interview", true);
}

const snapshot = {
  state: {
    interviewId: "interview-1",
    architectureRevision: "rev-1",
    questions: [{ questionId: "opening-1", ordinal: 1, phase: "opening", prompt: "Explain.", componentIds: [], grouped: false }],
    phase: "opening",
    status: "awaiting_answer",
    currentQuestion: { questionId: "opening-1", ordinal: 1, phase: "opening", prompt: "Explain.", componentIds: [], grouped: false },
    questionOrdinal: 1,
    totalQuestions: 1,
    answers: [],
    followUps: [],
    startedAt: "2026-08-31T00:00:00.000Z",
  },
  question: null,
  storageRevision: 0,
};
const service = {
  start: () => snapshot,
  get: () => snapshot,
  submitAnswer: () => snapshot,
  followUp: () => snapshot,
  advance: () => snapshot,
  end: () => snapshot,
};
const context = { challenge: { requirements: [] }, architecture: { version: 1, components: [], connections: [] } };
const started = await registry.invoke("start_design_interview", context, {}, { interviewService: service });
assert.equal(started.ok, true);
const missingService = await registry.invoke("start_design_interview", context, {});
assert.equal(missingService.ok, false);
if (!missingService.ok) assert.equal(missingService.code, "NOT_FOUND");

console.log("verify-interview-capabilities: ok");
