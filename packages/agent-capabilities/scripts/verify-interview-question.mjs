import assert from "node:assert/strict";
import {
  InterviewQuestionContractError,
  assertInterviewQuestionCard,
  selectInterviewQuestion,
} from "../dist/index.js";

const card = {
  cardId: "scale-service",
  slotId: "live-scale-v2",
  kind: "live_scale",
  evidenceRevision: "rev-1",
  targetRefs: [{ kind: "component", id: "service-1" }],
  verifiedFacts: ["The service is on the current request path."],
  allowedProbeAngles: ["capacity", "tradeoff"],
  difficulty: "early_career",
  prerequisiteConcepts: ["capacity"],
  forbiddenAssumptions: ["Do not assume provider limits."],
  fallbackPrompt: "Increase the capacity of the highlighted component and explain one tradeoff.",
  calibrationId: "cal-1",
  coachingObjectiveSummary: "The calibrated load is served without the observed bottleneck.",
};

assert.doesNotThrow(() => assertInterviewQuestionCard(card));
const input = { slotId: "live-scale-v2", evidenceRevision: "rev-1", candidateCardId: "scale-service", probeAngle: "capacity" };
const selected = selectInterviewQuestion([card], input);
assert.equal(selected.selectionSource, "model");
assert.equal(selected.cardId, "scale-service");
assert.equal(selected.prompt, card.fallbackPrompt);

const fallback = selectInterviewQuestion([{ ...card, cardId: "a-card" }, card], { ...input, candidateCardId: "missing", probeAngle: "unknown" });
assert.equal(fallback.selectionSource, "deterministic_fallback");
assert.equal(fallback.cardId, "a-card");
assert.equal(fallback.probeAngle, "capacity");
assert.equal(selectInterviewQuestion([card], { ...input, optionalWording: "for the current workload" }).prompt, `${card.fallbackPrompt} for the current workload.`);
assert.throws(() => selectInterviewQuestion([{ ...card, evidenceRevision: "old" }], input), InterviewQuestionContractError);
assert.throws(() => selectInterviewQuestion([card], { ...input, optionalWording: "must use a CDN" }), /prescribe/);
assert.throws(() => assertInterviewQuestionCard({ ...card, kind: "challenge_edge_case" }), /does not match/);
assert.throws(() => assertInterviewQuestionCard({ ...card, fallbackPrompt: "x".repeat(241) }), /fallbackPrompt/);
assert.doesNotThrow(() => assertInterviewQuestionCard({ ...card, evidenceRevision: "r".repeat(500) }));
assert.throws(() => assertInterviewQuestionCard({ ...card, evidenceRevision: "r".repeat(16_385) }), /evidenceRevision/);
assert.deepEqual(selectInterviewQuestion([card], input), selectInterviewQuestion([card], input));
console.log("verify-interview-question: ok");
