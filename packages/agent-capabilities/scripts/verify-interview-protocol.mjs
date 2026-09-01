import assert from "node:assert/strict";
import {
  buildInterviewEvaluationPrompt,
  buildInterviewFollowUpPrompt,
  classifyInterviewReadiness,
  safeParseInterviewEvaluation,
  buildInterviewSimulationCritiquePrompt,
  safeParseInterviewSimulationCritique,
} from "../dist/index.js";

const evaluation = safeParseInterviewEvaluation({
  verdict: "partial",
  explanation: "The answer identifies the service but omits cache behavior.",
  strengths: ["Identifies the service."],
  gaps: ["Omits cache behavior."],
  idealAnswer: "Explain both cache hits and misses.",
  confidence: "high",
  grounding: "architecture_evidence",
});
assert.equal(evaluation.success, true);
if (!evaluation.success) throw new Error(evaluation.errors.join(" "));
assert.equal(safeParseInterviewEvaluation({ ...evaluation.data, extra: "ignore me" }).success, false);
assert.equal(safeParseInterviewEvaluation({ ...evaluation.data, grounding: "invented" }).success, false);
assert.equal(safeParseInterviewEvaluation({ ...evaluation.data, strengths: ["x".repeat(4_001)] }).success, false);
const critique = safeParseInterviewSimulationCritique({ verdict: "partially_satisfies", summary: "The redesign improves capacity.", strengths: ["Added capacity."], gaps: ["Budget impact is unresolved."], nextStep: "Inspect the doubled-demand cost result.", grounding: "simulator_evidence" });
assert.equal(critique.success, true);
assert.equal(safeParseInterviewSimulationCritique({ ...critique.data, verdict: "correct" }).success, false);
assert.equal(safeParseInterviewSimulationCritique({ ...critique.data, extra: "no" }).success, false);

assert.equal(classifyInterviewReadiness("yes, next"), "ready");
assert.equal(classifyInterviewReadiness("I'm ready for the next question"), "ready");
assert.equal(classifyInterviewReadiness("Why does the cache matter?"), "follow_up");
assert.equal(classifyInterviewReadiness("okay"), "ambiguous");

const evaluationPrompt = buildInterviewEvaluationPrompt({ question: "Explain the request path.", answer: "It reaches the service." });
assert.match(evaluationPrompt, /Do not reveal future interview questions/);
assert.match(evaluationPrompt, /No simulator evidence was supplied/);
const followUpPrompt = buildInterviewFollowUpPrompt({ question: "Explain the request path.", evaluation: evaluation.data, followUp: "Why does the cache matter?" });
assert.match(followUpPrompt, /Remain on this question/);
assert.match(followUpPrompt, /another follow-up or is ready/);
assert.match(buildInterviewSimulationCritiquePrompt({ question: "Redesign the canvas.", reviewEvidence: "reviewDigest=digest-1" }), /exact reviewDigest/i);

console.log("verify-interview-protocol: ok");
