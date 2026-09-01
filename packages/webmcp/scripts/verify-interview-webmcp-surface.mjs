import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { buildInterviewWebMcpSurface } from "../dist/index.js";

const context = {
  challenge: { slug: "url-shortener", version: 1, title: "Global URL Shortener", prompt: "Design", developmentOnly: false, workload: { requestsPerSecond: 1, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 1, allowedComponentTypes: ["service"] },
  architecture: { version: 1, components: [], connections: [] },
  cost: { monthlyTotal: 0, lineItems: [] },
  requirementResults: [], reviewPackets: { overview: { failedRequirements: [] }, component: {}, requirement: {}, workload: {}, cost: { contributors: [], topContributors: [], budget: 1 } },
  evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "run-1", simulatorVersion: "test", isStale: false, generatedAt: "fixed" },
};

const state = {
  interviewId: "interview-1",
  architectureRevision: "rev-1",
  questions: [{ kind: "discussion", questionId: "q-opening-1", ordinal: 1, phase: "opening", prompt: "What is the read path?", componentIds: [], grouped: false }],
  phase: "opening",
  status: "awaiting_answer",
  currentQuestion: { kind: "discussion", questionId: "q-opening-1", ordinal: 1, phase: "opening", prompt: "What is the read path?", componentIds: [], grouped: false },
  questionOrdinal: 1,
  totalQuestions: 1,
  answers: [],
  followUps: [],
  startedAt: "fixed",
};
const snapshot = { state, question: state.currentQuestion, storageRevision: 1 };
const interviewService = {
  start: () => snapshot,
  get: () => snapshot,
  submitAnswer: () => snapshot,
  followUp: () => snapshot,
  advance: () => snapshot,
  end: () => snapshot,
  prepareSimulationReview: () => snapshot,
  submitSimulationCritique: () => snapshot,
};
const registry = createDefaultCapabilityRegistry();
const getContext = () => context;

const unavailable = await buildInterviewWebMcpSurface({ registry, getContext });
assert.deepEqual(unavailable.tools, []);
assert.equal(unavailable.skipped.length, 9);

const surface = await buildInterviewWebMcpSurface({ registry, getContext, interviewService });
assert.deepEqual(surface.resolvedNames, [
  "start_design_interview", "get_design_interview", "submit_interview_answer",
  "follow_up_design_interview", "advance_design_interview", "end_design_interview", "restart_design_interview",
  "prepare_interview_simulation_review", "submit_interview_simulation_critique",
]);
assert.equal(surface.tools.length, 9);
const start = surface.tools.find((tool) => tool.name === "start_design_interview");
assert.ok(start);
const result = await start.execute({}, {});
assert.equal(result.ok, true);
assert.equal(result.data.data.state.interviewId, "interview-1");

console.log("verify-interview-webmcp-surface: ok");
