import assert from "node:assert/strict";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const localStorage = new MemoryStorage();
globalThis.window = { localStorage };

const { createBrowserInterviewRepository } = await import("../features/agent-session/interview-storage.ts");

const state = {
  interviewId: "interview-browser-1",
  architectureRevision: "rev-1",
  questions: [{ kind: "discussion", questionId: "opening-1", ordinal: 1, phase: "opening", prompt: "Explain the path.", componentIds: [], grouped: false }],
  phase: "opening",
  status: "awaiting_answer",
  currentQuestion: { kind: "discussion", questionId: "opening-1", ordinal: 1, phase: "opening", prompt: "Explain the path.", componentIds: [], grouped: false },
  questionOrdinal: 1,
  totalQuestions: 1,
  answers: [],
  followUps: [],
  startedAt: "2026-08-31T00:00:00.000Z",
};
const start = { type: "start", interviewId: state.interviewId, architectureRevision: state.architectureRevision, questions: state.questions, startedAt: state.startedAt };
const baselineArchitecture = { version: 1, components: [], connections: [] };
const repository = createBrowserInterviewRepository("anonymous-browser");
const created = repository.saveStarted(state, start, baselineArchitecture);
assert.equal(created.revision, 0);
assert.equal(repository.load()?.state.interviewId, state.interviewId);
assert.deepEqual(repository.load()?.baselineArchitecture, baselineArchitecture);

const answerState = { ...state, status: "awaiting_follow_up_or_next", answers: [{ answerId: "answer-1", questionId: "opening-1", answer: "The request reaches the service.", verdict: "partial", explanation: "Missing cache detail.", strengths: ["Service identified."], gaps: ["Cache omitted."], idealAnswer: "Include the cache.", createdAt: "2026-08-31T00:01:00.000Z" }] };
const answer = { type: "answer", questionId: "opening-1", answerId: "answer-1", answer: "The request reaches the service.", evaluation: answerState.answers[0], createdAt: "2026-08-31T00:01:00.000Z" };
const committed = repository.commit({ expectedRevision: 0, eventId: "answer-1", event: answer, state: answerState });
assert.equal(committed.revision, 1);
assert.equal(committed.events.length, 2);
assert.equal(repository.commit({ expectedRevision: 0, eventId: "answer-1", event: answer, state: answerState }).revision, 1);

assert.throws(
  () => repository.commit({ expectedRevision: 0, eventId: "answer-2", event: { ...answer, answerId: "answer-2" }, state: answerState }),
  (error) => error?.code === "conflict",
);

console.log("verify-interview-storage: ok");
