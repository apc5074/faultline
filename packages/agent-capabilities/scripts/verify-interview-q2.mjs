import assert from "node:assert/strict";
import { buildPlayerAddedComponentCards, releasePlayerAddedComponentQuestion, selectPlayerAddedComponentQuestion } from "../dist/index.js";

const base = {
  challenge: { slug: "url-shortener", version: 3, title: "URL", prompt: "Design", developmentOnly: false, workload: { requestsPerSecond: 10, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 10, allowedComponentTypes: ["service", "cache"] },
  architecture: { version: 1, components: [
    { id: "service-start", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    { id: "cache-added", type: "cache", config: {}, deployments: [], ui: { x: 1, y: 0 } },
  ], connections: [] },
  evidenceMeta: { architectureRevision: "rev-1", simulationRunId: "run-1", simulatorVersion: "sim-1", isStale: false, generatedAt: "fixed" },
  simulation: { available: true, components: {}, workloadPaths: { redirects: { channelId: "redirects", paths: [{ pathId: "path-1", componentIds: ["service-start", "cache-added"], connectionIds: [], status: "complete" }], inactiveComponentIds: [] } } },
};
const cards = { cache: { type: "cache", whyHere: "speed", pros: ["fast"], cons: ["stale"], commonMistakes: ["unbounded"], placementIntent: "near reads" } };
const set = buildPlayerAddedComponentCards({ context: base, starterComponentIds: ["service-start"], componentCards: cards });
assert.deepEqual(set.candidates.map((card) => card.targetRefs[0].id), ["cache-added"]);
const question = selectPlayerAddedComponentQuestion({ context: base, starterComponentIds: ["service-start"], componentCards: cards }, { probeAngle: "one tradeoff" });
assert.equal(releasePlayerAddedComponentQuestion(question, undefined).code, "PRESENTATION_REQUIRED");
const receipt = { contractVersion: "component-explanation-1", commandId: question.presentation.commandId, componentId: "cache-added", evidenceRevision: "rev-1", appliedSessionRevision: 0, annotationStatus: "rendered", cameraStatus: "centered", appliedZoom: 1, status: "applied" };
assert.equal(releasePlayerAddedComponentQuestion(question, receipt).ok, true);
assert.deepEqual(question.rubric.requiredTopics, ["why this component exists", "role in the request path", "one concrete tradeoff"]);
assert.equal(question.evidence.componentId, "cache-added");
assert.equal(question.evidence.verifiedFacts.length > 0, true);
assert.equal(releasePlayerAddedComponentQuestion(question, { ...receipt, componentId: "service-start" }).code, "STALE_EVIDENCE");
assert.equal(buildPlayerAddedComponentCards({ context: { ...base, simulation: { available: false } }, starterComponentIds: ["service-start"], componentCards: cards }).candidates.length, 0);

const longRevision = "r".repeat(500);
const longContext = {
  ...base,
  evidenceMeta: { ...base.evidenceMeta, architectureRevision: longRevision },
  simulation: {
    available: true,
    components: {},
    workloadPaths: {
      redirects: {
        channelId: "redirects",
        paths: [{ pathId: "path-1", componentIds: ["service-start", "cache-added"], connectionIds: [], status: "complete" }],
        inactiveComponentIds: [],
      },
    },
  },
};
const longSet = buildPlayerAddedComponentCards({ context: longContext, starterComponentIds: ["service-start"], componentCards: cards });
assert.equal(longSet.candidates.length, 1);
assert.equal(selectPlayerAddedComponentQuestion({ context: longContext, starterComponentIds: ["service-start"], componentCards: cards }).question.evidenceRevision, longRevision);

console.log("verify-interview-q2: ok");
