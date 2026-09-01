import assert from "node:assert/strict";
import {
  createInterviewState,
  transitionInterview,
} from "../dist/index.js";

const questions = [
  { kind: "discussion", questionId: "opening-1", ordinal: 1, phase: "opening", prompt: "Explain the request path.", componentIds: [], grouped: false },
  { kind: "discussion", questionId: "opening-2", ordinal: 2, phase: "opening", prompt: "What fails first?", componentIds: [], grouped: false },
  { kind: "component", questionId: "component-services", ordinal: 3, phase: "component", prompt: "How do the services scale?", componentIds: ["svc-1", "svc-2"], grouped: true },
];

const started = createInterviewState({
  type: "start",
  interviewId: "interview-1",
  architectureRevision: "rev-1",
  questions,
  startedAt: "2026-08-31T00:00:00.000Z",
});
assert.equal(started.ok, true);
if (!started.ok) throw new Error(started.message);
assert.equal(started.state.currentQuestion?.questionId, "opening-1");
assert.equal(started.state.status, "awaiting_answer");

const skipped = transitionInterview(started.state, {
  type: "advance",
  questionId: "opening-1",
  ready: true,
  advancedAt: "2026-08-31T00:01:00.000Z",
});
assert.equal(skipped.ok, false);
if (skipped.ok) throw new Error("advance should require an answer");
assert.equal(skipped.code, "ANSWER_REQUIRED");

const answered = transitionInterview(started.state, {
  type: "answer",
  questionId: "opening-1",
  answerId: "answer-1",
  answer: "The request reaches the service before the database.",
  evaluation: {
    verdict: "partial",
    explanation: "The path is incomplete.",
    strengths: ["Identified the service."],
    gaps: ["Did not explain caching."],
    idealAnswer: "Include the cache and failure path.",
  },
  createdAt: "2026-08-31T00:02:00.000Z",
});
assert.equal(answered.ok, true);
if (!answered.ok) throw new Error(answered.message);
assert.equal(answered.state.status, "awaiting_follow_up_or_next");

const followUp = transitionInterview(answered.state, {
  type: "follow_up",
  questionId: "opening-1",
  followUpId: "follow-up-1",
  question: "Why does the cache matter here?",
  answer: "It can avoid repeated reads on the hot path.",
  createdAt: "2026-08-31T00:03:00.000Z",
});
assert.equal(followUp.ok, true);
if (!followUp.ok) throw new Error(followUp.message);
assert.equal(followUp.state.currentQuestion?.questionId, "opening-1");
assert.equal(followUp.state.followUps.length, 1);

const advanced = transitionInterview(followUp.state, {
  type: "advance",
  questionId: "opening-1",
  ready: true,
  advancedAt: "2026-08-31T00:04:00.000Z",
});
assert.equal(advanced.ok, true);
if (!advanced.ok) throw new Error(advanced.message);
assert.equal(advanced.state.currentQuestion?.questionId, "opening-2");
assert.equal(advanced.state.status, "awaiting_answer");

const wrongQuestion = transitionInterview(advanced.state, {
  type: "answer",
  questionId: "opening-1",
  answerId: "answer-2",
  answer: "This must be rejected.",
  evaluation: {
    verdict: "incorrect",
    explanation: "Wrong question.",
    strengths: [],
    gaps: ["Question mismatch."],
    idealAnswer: "Answer the current question.",
  },
  createdAt: "2026-08-31T00:05:00.000Z",
});
assert.equal(wrongQuestion.ok, false);
if (wrongQuestion.ok) throw new Error("wrong question should be rejected");
assert.equal(wrongQuestion.code, "WRONG_QUESTION");

const stale = transitionInterview(advanced.state, { type: "stale", staleAt: "2026-08-31T00:06:00.000Z" });
assert.equal(stale.ok, true);
if (!stale.ok) throw new Error(stale.message);
const staleMutation = transitionInterview(stale.state, {
  type: "answer",
  questionId: "opening-2",
  answerId: "answer-3",
  answer: "No longer current.",
  evaluation: {
    verdict: "incorrect",
    explanation: "Stale.",
    strengths: [],
    gaps: [],
    idealAnswer: "Restart.",
  },
  createdAt: "2026-08-31T00:07:00.000Z",
});
assert.equal(staleMutation.ok, false);
if (staleMutation.ok) throw new Error("stale interview should reject mutations");
assert.equal(staleMutation.code, "INTERVIEW_STALE");

const simulationQuestions = [
  ...questions,
  {
    kind: "simulation",
    questionId: "simulation-traffic-double-v1",
    ordinal: 4,
    phase: "simulation",
    prompt: "Demand has doubled. Redesign the architecture.",
    scenario: { type: "traffic_multiplier", parameters: { multiplier: 2 } },
    sourceChallengeId: "tiny-api",
    baselineArchitectureRevision: "rev-baseline",
    componentIds: [],
    grouped: false,
  },
];
const simulationStarted = createInterviewState({
  type: "start",
  interviewId: "interview-simulation",
  architectureRevision: "rev-baseline",
  questions: simulationQuestions,
  startedAt: "2026-08-31T01:00:00.000Z",
});
assert.equal(simulationStarted.ok, true);
if (!simulationStarted.ok) throw new Error(simulationStarted.message);
const componentAnswered = transitionInterview(simulationStarted.state, {
  type: "answer",
  questionId: "opening-1",
  answerId: "simulation-answer-1",
  answer: "The request reaches the service.",
  evaluation: { verdict: "partial", explanation: "Partial.", strengths: [], gaps: [], idealAnswer: "Explain the path." },
  createdAt: "2026-08-31T01:01:00.000Z",
});
assert.equal(componentAnswered.ok, true);
if (!componentAnswered.ok) throw new Error(componentAnswered.message);
const componentNext = transitionInterview(componentAnswered.state, { type: "advance", questionId: "opening-1", ready: true, advancedAt: "2026-08-31T01:02:00.000Z" });
assert.equal(componentNext.ok, true);
if (!componentNext.ok) throw new Error(componentNext.message);
const skippedSimulation = transitionInterview(componentNext.state, { type: "advance", questionId: "opening-2", ready: true, advancedAt: "2026-08-31T01:03:00.000Z" });
assert.equal(skippedSimulation.ok, false);
if (skippedSimulation.ok) throw new Error("component advance should still require an answer");
const advancedToSimulation = transitionInterview(componentNext.state, {
  type: "answer",
  questionId: "opening-2",
  answerId: "simulation-answer-2",
  answer: "The service is the first dependency.",
  evaluation: { verdict: "partial", explanation: "Partial.", strengths: [], gaps: [], idealAnswer: "Explain the failure path." },
  createdAt: "2026-08-31T01:04:00.000Z",
});
assert.equal(advancedToSimulation.ok, true);
if (!advancedToSimulation.ok) throw new Error(advancedToSimulation.message);
const simulationState = transitionInterview(advancedToSimulation.state, { type: "advance", questionId: "opening-2", ready: true, advancedAt: "2026-08-31T01:05:00.000Z" });
assert.equal(simulationState.ok, true);
if (!simulationState.ok) throw new Error(simulationState.message);
assert.equal(simulationState.state.phase, "component");
const simulationComponentAnswer = transitionInterview(simulationState.state, {
  type: "answer",
  questionId: "component-services",
  answerId: "simulation-answer-3",
  answer: "Services scale horizontally.",
  evaluation: { verdict: "partial", explanation: "Partial.", strengths: [], gaps: [], idealAnswer: "Explain scaling." },
  createdAt: "2026-08-31T01:06:00.000Z",
});
assert.equal(simulationComponentAnswer.ok, true);
if (!simulationComponentAnswer.ok) throw new Error(simulationComponentAnswer.message);
const enteredSimulation = transitionInterview(simulationComponentAnswer.state, { type: "advance", questionId: "component-services", ready: true, advancedAt: "2026-08-31T01:07:00.000Z" });
assert.equal(enteredSimulation.ok, true);
if (!enteredSimulation.ok) throw new Error(enteredSimulation.message);
assert.equal(enteredSimulation.state.phase, "simulation");
assert.equal(enteredSimulation.state.status, "awaiting_design_change");
const simulationAnswer = transitionInterview(enteredSimulation.state, {
  type: "answer",
  questionId: "simulation-traffic-double-v1",
  answerId: "not-a-redesign",
  answer: "I would add a cache.",
  evaluation: { verdict: "correct", explanation: "No.", strengths: [], gaps: [], idealAnswer: "Change the canvas." },
  createdAt: "2026-08-31T01:08:00.000Z",
});
assert.equal(simulationAnswer.ok, false);
if (simulationAnswer.ok) throw new Error("simulation answer should be rejected");
assert.equal(simulationAnswer.code, "SIMULATION_QUESTION_REQUIRED");
const prepared = transitionInterview(enteredSimulation.state, {
  type: "prepare_simulation_review",
  questionId: "simulation-traffic-double-v1",
  candidateArchitectureRevision: "rev-candidate-1",
  reviewDigest: "digest-1",
  preparedAt: "2026-08-31T01:09:00.000Z",
});
assert.equal(prepared.ok, true);
if (!prepared.ok) throw new Error(prepared.message);
assert.equal(prepared.state.status, "awaiting_simulation_critique");
const replaced = transitionInterview(prepared.state, { type: "prepare_simulation_review", questionId: "simulation-traffic-double-v1", candidateArchitectureRevision: "rev-candidate-2", reviewDigest: "digest-2", preparedAt: "2026-08-31T01:10:00.000Z" });
assert.equal(replaced.ok, true);
if (!replaced.ok) throw new Error(replaced.message);
const staleCritique = transitionInterview(replaced.state, { type: "simulation_critique", questionId: "simulation-traffic-double-v1", candidateArchitectureRevision: "rev-candidate-1", reviewDigest: "digest-1", critique: { verdict: "does_not_satisfy", summary: "Stale.", strengths: [], gaps: [], nextStep: "Retry.", grounding: "validation_evidence" }, completedAt: "2026-08-31T01:11:00.000Z" });
assert.equal(staleCritique.ok, false);
if (staleCritique.ok) throw new Error("stale critique should be rejected");
assert.equal(staleCritique.code, "REVIEW_STALE");
const completed = transitionInterview(replaced.state, { type: "simulation_critique", questionId: "simulation-traffic-double-v1", candidateArchitectureRevision: "rev-candidate-2", reviewDigest: "digest-2", critique: { verdict: "partially_satisfies", summary: "Good redesign.", strengths: ["Changed the design."], gaps: [], nextStep: "Inspect evidence.", grounding: "simulator_evidence" }, completedAt: "2026-08-31T01:12:00.000Z" });
assert.equal(completed.ok, true);
if (!completed.ok) throw new Error(completed.message);
assert.equal(completed.state.status, "completed");
assert.equal(completed.state.phase, "complete");
assert.equal(completed.state.currentQuestion, null);

console.log("verify-interview-state: ok");
