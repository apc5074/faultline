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
  challenge: { slug: "url-shortener", version: 1, requirements: [] },
  architecture: { version: 1, components: [{ id: "svc-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }], connections: [] },
  evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "run-1", simulatorVersion: "3", isStale: false, generatedAt: "2026-08-31T00:00:00.000Z" },
};
const service = createDesignInterviewService("test-owner");
const started = service.start(context);
assert.equal(started.state.currentQuestion?.questionId, "opening-1");
assert.equal(started.state.status, "awaiting_answer");
assert.equal(started.state.totalQuestions, 5);
assert.equal(started.state.challengeVersion, 1);
assert.equal(started.assessment?.slotId, "request-path-v2");
assert.ok(Array.isArray(started.assessment?.requiredTopics) && started.assessment.requiredTopics.length > 0);
assert.ok(Array.isArray(started.assessment?.evidenceSummary) && started.assessment.evidenceSummary.length > 0);

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

const simulationService = createDesignInterviewService("simulation-owner");
const simulationComponents = [{ id: "svc-only", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }];
let simulation = simulationService.start({ ...context, architecture: { ...context.architecture, components: simulationComponents } });
for (const questionId of ["opening-1", "opening-2", "opening-3", "component-svc-only"]) {
  const sameContext = { ...context, architecture: { ...context.architecture, components: simulationComponents } };
  simulation = simulationService.submitAnswer(sameContext, { questionId, answer: "A bounded answer.", evaluation: { verdict: "partial", explanation: "Partial.", strengths: [], gaps: [], idealAnswer: "Explain the design." } });
  simulation = simulationService.advance(sameContext, { questionId, ready: true });
}
assert.equal(simulation.state.phase, "simulation");
assert.equal(simulation.state.status, "awaiting_design_change");
const redesigned = simulationService.syncArchitecture({ ...context, evidenceMeta: { ...context.evidenceMeta, architectureRevision: "rev-2" }, architecture: { ...context.architecture, components: [{ ...simulationComponents[0], config: { instances: 2 }, ui: { x: 400, y: 400 } }] } });
assert.equal(redesigned.state.status, "awaiting_design_change");
assert.equal(redesigned.state.candidateArchitectureRevision, "rev-2");
const uiOnly = simulationService.syncArchitecture({ ...context, evidenceMeta: { ...context.evidenceMeta, architectureRevision: "rev-2" }, architecture: { ...context.architecture, components: [{ ...simulationComponents[0], config: { instances: 2 }, ui: { x: 999, y: 999 } }] } });
assert.equal(uiOnly.state.candidateArchitectureRevision, "rev-2");
const prepared = simulationService.prepareSimulationReview({ ...context, evidenceMeta: { ...context.evidenceMeta, architectureRevision: "rev-2" }, architecture: { ...context.architecture, components: [{ ...simulationComponents[0], config: { instances: 2 }, ui: { x: 999, y: 999 } }] } }, { interviewId: simulation.state.interviewId, questionId: "simulation-traffic-double-v1" });
assert.equal(prepared.state.status, "awaiting_simulation_critique");
assert.equal(prepared.simulationReview?.official, false);
assert.equal(prepared.simulationReview?.simulated, true);
assert.ok(prepared.simulationReview?.reviewDigest);
const completedSimulation = simulationService.submitSimulationCritique({ ...context, evidenceMeta: { ...context.evidenceMeta, architectureRevision: "rev-2" }, architecture: { ...context.architecture, components: [{ ...simulationComponents[0], config: { instances: 2 }, ui: { x: 999, y: 999 } }] } }, { interviewId: simulation.state.interviewId, questionId: "simulation-traffic-double-v1", reviewDigest: prepared.simulationReview.reviewDigest, candidateArchitectureRevision: "rev-2", critique: { verdict: "does_not_satisfy", summary: "Validation evidence is incomplete.", strengths: [], gaps: ["The request path is not validated."], nextStep: "Add a valid path and review again.", grounding: "validation_evidence" } });
assert.equal(completedSimulation.state.status, "completed");

service.clear();
assert.throws(() => service.get(context), (error) => error?.code === "NO_INTERVIEW");
console.log("verify-interview-service: ok");
