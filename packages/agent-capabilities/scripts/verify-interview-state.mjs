import assert from "node:assert/strict";
import {
  createInterviewState,
  transitionInterview,
} from "../dist/index.js";

const questions = [
  { questionId: "opening-1", ordinal: 1, phase: "opening", prompt: "Explain the request path.", componentIds: [], grouped: false },
  { questionId: "opening-2", ordinal: 2, phase: "opening", prompt: "What fails first?", componentIds: [], grouped: false },
  { questionId: "component-services", ordinal: 3, phase: "component", prompt: "How do the services scale?", componentIds: ["svc-1", "svc-2"], grouped: true },
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

console.log("verify-interview-state: ok");
