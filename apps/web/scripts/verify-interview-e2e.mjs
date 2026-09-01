import assert from "node:assert/strict";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const localStorage = new MemoryStorage();
globalThis.window = { localStorage };
const { createDesignInterviewService } = await import("../features/agent-session/interview-service.ts");

const evaluation = (verdict) => ({ verdict, explanation: "The answer identifies the main behavior.", strengths: ["Clear causal explanation."], gaps: verdict === "correct" ? [] : ["Add the failure tradeoff."], idealAnswer: "Explain the request path, scaling behavior, and failure tradeoff." });
const context = (revision = "rev-1", components = []) => ({
  challenge: { slug: "url-shortener", requirements: [] },
  architecture: { version: 1, components, connections: [] },
  evidenceMeta: { architectureRevision: revision, simulationRunId: "run-1", simulatorVersion: "3", isStale: false, generatedAt: "fixed" },
});
const components = [
  { id: "svc-b", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
  { id: "svc-a", type: "service", config: {}, deployments: [], ui: { x: 100, y: 0 } },
  { id: "db-1", type: "postgres", config: {}, deployments: [], ui: { x: 200, y: 0 } },
];

const service = createDesignInterviewService("e2e-owner");
let current = service.start(context("rev-1", components));
assert.equal(current.state.currentQuestion?.questionId, "opening-1");
assert.equal(current.state.totalQuestions, 6);

current = service.submitAnswer(context("rev-1", components), { questionId: "opening-1", answer: "The request reaches the service.", evaluation: evaluation("correct") });
for (let count = 0; count < 3; count += 1) {
  current = service.followUp(context("rev-1", components), { questionId: "opening-1", question: `Follow-up ${count + 1}?`, answer: "The cache absorbs repeated reads." });
  assert.equal(current.state.currentQuestion?.questionId, "opening-1");
  assert.equal(current.presentationCue, undefined);
}
current = service.advance(context("rev-1", components), { questionId: "opening-1", ready: true });
assert.equal(current.state.currentQuestion?.questionId, "opening-2");

const staleService = createDesignInterviewService("stale-owner");
const staleStarted = staleService.start(context("rev-1", components));
assert.throws(() => staleService.submitAnswer(context("rev-2", components), { questionId: "opening-1", answer: "old", evaluation: evaluation("partial") }), (error) => error?.code === "STALE_ARCHITECTURE");
assert.equal(staleService.get(context("rev-2", components)).state.status, "stale");
const restarted = staleService.restart(context("rev-2", components));
assert.notEqual(restarted.state.interviewId, staleStarted.state.interviewId);
assert.equal(restarted.state.architectureRevision, "rev-2");

const resumed = createDesignInterviewService("e2e-owner").get(context("rev-1", components));
assert.equal(resumed.state.followUps.length, 3);
assert.equal(resumed.state.answers[0]?.verdict, "correct");
assert.equal(resumed.state.currentQuestion?.questionId, "opening-2");
assert.ok(JSON.parse(localStorage.getItem("faultline:design-interview:v2:" + encodeURIComponent("stale-owner"))).history?.length === 1);

const completeService = createDesignInterviewService("complete-owner");
let complete = completeService.start(context("rev-1"));
for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
  const questionId = `opening-${ordinal}`;
  complete = completeService.submitAnswer(context("rev-1"), { questionId, answer: "A bounded answer.", evaluation: evaluation(ordinal === 2 ? "partial" : "incorrect") });
  complete = completeService.advance(context("rev-1"), { questionId, ready: true });
  assert.equal(complete.state.questionOrdinal, ordinal + 1);
}
assert.equal(complete.state.phase, "simulation");
assert.equal(complete.state.status, "awaiting_design_change");
assert.equal(complete.state.currentQuestion?.questionId, "simulation-traffic-double-v1");
assert.throws(() => completeService.submitAnswer(context("rev-1"), { questionId: "opening-3", answer: "late", evaluation: evaluation("correct") }));

console.log("verify-interview-e2e: ok");
