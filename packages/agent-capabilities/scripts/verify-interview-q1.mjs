import assert from "node:assert/strict";
import { buildRequestPathEvidence, buildRequestPathQuestion, validateRequestPathAnswer } from "../dist/index.js";

const base = {
  challenge: { slug: "url-shortener", version: 3, title: "URL", prompt: "Design", developmentOnly: false, workload: { requestsPerSecond: 10, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 10, allowedComponentTypes: ["service"] },
  architecture: { version: 1, components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }, { id: "service-2", type: "service", config: {}, deployments: [], ui: { x: 1, y: 0 } }], connections: [{ id: "edge-1", sourceComponentId: "service-1", sourcePortId: "out", targetComponentId: "service-2", targetPortId: "in", type: "request" }] },
  evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "run-1", simulatorVersion: "sim-1", isStale: false, generatedAt: "fixed" },
};
const path = { pathId: "path-1", componentIds: ["service-1", "service-2"], connectionIds: ["edge-1"], status: "complete" };
const complete = { ...base, simulation: { available: true, components: {}, workloadPaths: { redirects: { channelId: "redirects", paths: [path], inactiveComponentIds: [] } } } };
const question = buildRequestPathQuestion(complete);
assert.equal(question.questionId, "request-path-v2");
assert.equal(question.rubric.status, "valid");
assert.equal(question.evidence.channelId, "redirects");
assert.equal(question.presentationCue.kind, "path");
assert.equal(question.presentationCue.targets.length, 3);

const partial = buildRequestPathQuestion({ ...complete, simulation: { ...complete.simulation, workloadPaths: { redirects: { ...complete.simulation.workloadPaths.redirects, paths: [{ ...path, status: "partial" }] } } } });
assert.equal(partial.rubric.status, "partial");
const broken = buildRequestPathQuestion({ ...complete, simulation: { ...complete.simulation, workloadPaths: { redirects: { ...complete.simulation.workloadPaths.redirects, paths: [{ ...path, status: "failed", failureCode: "NO_ROUTE" }] } } } });
assert.equal(broken.rubric.status, "broken");
const multi = buildRequestPathQuestion({ ...complete, simulation: { ...complete.simulation, workloadPaths: { zed: { channelId: "zed", paths: [{ ...path, pathId: "z-path" }], inactiveComponentIds: [] }, alpha: { channelId: "alpha", paths: [{ ...path, pathId: "a-path" }], inactiveComponentIds: [] } } } });
assert.equal(multi.evidence.channelId, "alpha");
const unavailable = buildRequestPathQuestion({ ...base, simulation: { available: false } });
assert.equal(unavailable.rubric.status, "unavailable");
assert.equal(unavailable.presentationCue, undefined);
assert.deepEqual(validateRequestPathAnswer({ questionId: question.questionId, evidenceRevision: "rev-1", answer: "The request crosses the service boundary.", evaluation: { verdict: "partial" } }, question), { ok: true });
assert.equal(validateRequestPathAnswer({ questionId: question.questionId, evidenceRevision: "old", answer: "stale", evaluation: {} }, question).code, "STALE_EVIDENCE");
assert.equal(validateRequestPathAnswer({ questionId: question.questionId, evidenceRevision: "rev-1", answer: "", evaluation: {} }, question).code, "INVALID_INPUT");
console.log("verify-interview-q1: ok");
