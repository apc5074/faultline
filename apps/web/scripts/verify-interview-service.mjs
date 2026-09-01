import assert from "node:assert/strict";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.window = { localStorage: new MemoryStorage() };
const { createDesignInterviewService } = await import("../features/agent-session/interview-service.ts");

const context = {
  challenge: { slug: "url-shortener", requirements: [] },
  architecture: { version: 1, components: [{ id: "svc-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }], connections: [] },
  evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "run-1", simulatorVersion: "3", isStale: false, generatedAt: "2026-08-31T00:00:00.000Z" },
};
const service = createDesignInterviewService("test-owner");
const started = service.start(context);
assert.equal(started.state.currentQuestion?.questionId, "opening-1");
assert.equal(started.state.status, "awaiting_answer");

const answered = service.submitAnswer(context, {
  questionId: "opening-1",
  answer: "The request reaches the service.",
  evaluation: { verdict: "partial", explanation: "Add the cache path.", strengths: ["Service identified."], gaps: ["Cache omitted."], idealAnswer: "Include cache behavior." },
});
assert.equal(answered.state.status, "awaiting_follow_up_or_next");

const followUp = service.followUp(context, { questionId: "opening-1", question: "Why add a cache?", answer: "To avoid repeated origin reads." });
assert.equal(followUp.state.currentQuestion?.questionId, "opening-1");

const next = service.advance(context, { questionId: "opening-1", ready: true });
assert.equal(next.state.currentQuestion?.questionId, "opening-2");

const staleContext = { ...context, evidenceMeta: { ...context.evidenceMeta, architectureRevision: "rev-2" } };
assert.throws(() => service.advance(staleContext, { questionId: "opening-2", ready: true }), (error) => error?.code === "STALE_ARCHITECTURE");

service.clear();
assert.throws(() => service.get(context), (error) => error?.code === "NO_INTERVIEW");
console.log("verify-interview-service: ok");
