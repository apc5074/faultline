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
  "restart_design_interview",
  "prepare_interview_simulation_review",
  "submit_interview_simulation_critique",
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
  restart: () => snapshot,
};
const context = { challenge: { requirements: [] }, architecture: { version: 1, components: [], connections: [] } };
const started = await registry.invoke("start_design_interview", context, {}, { interviewService: service });
assert.equal(started.ok, true);
const missingService = await registry.invoke("start_design_interview", context, {});
assert.equal(missingService.ok, false);
if (!missingService.ok) assert.equal(missingService.code, "NOT_FOUND");

class PreparationError extends Error {
  code = "PREPARATION_REQUIRED";
  constructor(message) {
    super(message);
    this.name = "DesignInterviewV2HostError";
  }
}
const prepService = {
  ...service,
  start() {
    throw new PreparationError("The interview needs a player-added component on the current request path. Add one unlocked component on the request path, then ask to be interviewed again.");
  },
};
const prepBlocked = await registry.invoke("start_design_interview", context, {}, { interviewService: prepService });
assert.equal(prepBlocked.ok, false);
if (!prepBlocked.ok) {
  assert.equal(prepBlocked.code, "INVALID_INPUT");
  assert.match(prepBlocked.message, /player-added component/);
  assert.equal(prepBlocked.message.includes("failed unexpectedly"), false);
  assert.equal(prepBlocked.recovery?.retryable, true);
  assert.equal(prepBlocked.recovery?.recoveryTool, "start_design_interview");
}

const submitAnswer = registry.get("submit_interview_answer");
assert.deepEqual(submitAnswer.inputSchema.jsonSchema.properties.evaluation.required, ["verdict", "explanation", "strengths", "gaps", "idealAnswer", "grounding"]);
const submitCritique = registry.get("submit_interview_simulation_critique");
assert.deepEqual(submitCritique.inputSchema.jsonSchema.properties.critique.required, ["verdict", "summary", "strengths", "gaps", "nextStep", "grounding"]);
assert.equal(submitCritique.inputSchema.jsonSchema.properties.critique.type, "object");
assert.equal(submitCritique.inputSchema.jsonSchema.properties.critique.additionalProperties, false);
const rejectedCritique = submitCritique.inputSchema.safeParse({
  interviewId: "interview-1",
  questionId: "opening-1",
  reviewDigest: "digest-1",
  candidateArchitectureRevision: "rev-1",
  critique: { verdict: "satisfies" },
});
assert.equal(rejectedCritique.success, false);
assert.match(registry.get("submit_interview_answer").description, /exactly once/i);
assert.match(registry.get("submit_interview_answer").description, /assessment\.requiredTopics/);
assert.match(registry.get("submit_interview_simulation_critique").description, /exactly one critique/i);
assert.match(registry.get("start_design_interview").description, /REQUIRED first tool/);
assert.match(registry.get("start_design_interview").description, /Never invent a freeform/);

console.log("verify-interview-capabilities: ok");
