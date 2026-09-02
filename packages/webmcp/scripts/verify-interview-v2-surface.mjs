import assert from "node:assert/strict";
import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { buildInterviewWebMcpSurface } from "../dist/index.js";

const context = { challenge: { slug: "url-shortener", version: 1, title: "URL", prompt: "Design", developmentOnly: false, workload: { requestsPerSecond: 1, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 1, allowedComponentTypes: ["service"] }, architecture: { version: 1, components: [], connections: [] }, evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "run-1", simulatorVersion: "sim-1", isStale: false, generatedAt: "fixed" } };
const snapshot = { state: { interviewId: "i", architectureRevision: "rev-1", questions: [], phase: "opening", status: "awaiting_answer", currentQuestion: null, questionOrdinal: 1, totalQuestions: 5, answers: [], followUps: [], startedAt: "fixed" }, question: null, storageRevision: 0 };
const service = { start: () => snapshot, get: () => snapshot, submitAnswer: () => snapshot, followUp: () => snapshot, end: () => snapshot, restart: () => snapshot, prepareSimulationReview: () => snapshot, submitSimulationCritique: () => snapshot };
const surface = await buildInterviewWebMcpSurface({ registry: createDefaultCapabilityRegistry(), getContext: () => context, interviewService: service });
assert.equal(surface.resolvedNames.includes("advance_design_interview"), false);
assert.equal(surface.resolvedNames.length, 8);
console.log("verify-interview-v2-surface: ok");
