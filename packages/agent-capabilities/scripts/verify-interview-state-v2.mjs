import assert from "node:assert/strict";
import { createInterviewV2State, INTERVIEW_V2_SKIP_LIVE_SCALE, INTERVIEW_V2_SLOT_ORDER, transitionInterviewV2 } from "../dist/index.js";

const slots = INTERVIEW_V2_SKIP_LIVE_SCALE
  ? [
      ["request_path", "request-path-v2"],
      ["component_justification", "component-justification-v2"],
      ["challenge_edge_case", "challenge-edge-case-v2"],
      ["live_failure", "live-failure-v2"],
    ]
  : [
      ["request_path", "request-path-v2"],
      ["component_justification", "component-justification-v2"],
      ["live_scale", "live-scale-v2"],
      ["challenge_edge_case", "challenge-edge-case-v2"],
      ["live_failure", "live-failure-v2"],
    ];
assert.deepEqual(INTERVIEW_V2_SLOT_ORDER, slots.map(([, slotId]) => slotId));
const assessmentFor = (slotId) => ({
  slotId,
  requiredTopics: ["topic-a", "topic-b", "topic-c"],
  evidenceSummary: [`Evidence for ${slotId}.`],
  evidenceBasis: "test",
  assessGuidance: "Use requiredTopics and evidenceSummary only.",
});
const questions = slots.map(([kind, slotId], index) => ({
  kind, slotId, questionId: `q-${index + 1}`, ordinal: index + 1, prompt: `Question ${index + 1}`, evidenceRevision: "rev-1",
  ...(kind === "live_scale"
    ? { targetComponentId: "service-1", calibrationId: `cal-${index + 1}`, coachingObjective: "Pass the bounded objective." }
    : {
        assessment: assessmentFor(slotId),
        ...(kind === "live_failure" ? { targetComponentId: "service-1" } : {}),
      }),
}));
const started = createInterviewV2State({ type: "start", interviewId: "i-1", architectureRevision: "rev-1", challengeId: "url-shortener", challengeVersion: 3, simulatorVersion: "sim-1", questions, startedAt: "fixed" });
assert.equal(started.ok, true);
let state = started.state;
const evaluation = {
  verdict: "partial",
  explanation: "The answer traces the request but misses one boundary.",
  strengths: ["Traced the request."],
  gaps: ["Missed one boundary."],
  idealAnswer: "Trace the current connected path and name one tradeoff.",
  grounding: "architecture_evidence",
};
const noAdvance = transitionInterviewV2(state, { type: "scenario_review", questionId: "q-1", architectureRevision: "rev-1", passed: true, reviewDigest: "bad" });
assert.equal(noAdvance.ok, false);
const invalidEvaluation = transitionInterviewV2(state, { type: "answer", questionId: "q-1", answer: "A bounded answer.", evaluation: { verdict: "partial", strength: "legacy", gap: "shape", betterExplanation: "rejected" } });
assert.equal(invalidEvaluation.ok, false);
assert.equal(invalidEvaluation.code, "INVALID_INPUT");
for (const question of ["q-1", "q-2"]) {
  const result = transitionInterviewV2(state, { type: "answer", questionId: question, answer: "A bounded answer.", evaluation });
  assert.equal(result.ok, true); state = result.state;
}
if (INTERVIEW_V2_SKIP_LIVE_SCALE) {
  assert.equal(state.currentQuestion.slotId, "challenge-edge-case-v2");
  const edge = transitionInterviewV2(state, { type: "answer", questionId: "q-3", answer: "A bounded edge-case answer.", evaluation });
  assert.equal(edge.ok, true); state = edge.state;
  assert.equal(state.currentQuestion.slotId, "live-failure-v2");
  assert.equal(state.status, "awaiting_chat_answer");
  const failure = transitionInterviewV2(state, { type: "answer", questionId: "q-4", answer: "Impact, recovery, remaining limit.", evaluation });
  assert.equal(failure.ok, true); state = failure.state;
  assert.equal(state.status, "completed");
} else {
  assert.equal(state.currentQuestion.slotId, "live-scale-v2");
  let failed = transitionInterviewV2(state, { type: "scenario_review", questionId: "q-3", architectureRevision: "rev-1", passed: false, critique: "Observed bottleneck." });
  assert.equal(failed.ok, true); state = failed.state; assert.equal(state.status, "awaiting_canvas_change");
  const edited = transitionInterviewV2(state, { type: "semantic_edit", architectureRevision: "rev-2" });
  assert.equal(edited.ok, true); state = edited.state;
  const passed = transitionInterviewV2(state, { type: "scenario_review", questionId: "q-3", architectureRevision: "rev-2", passed: true, reviewDigest: "digest-3" });
  assert.equal(passed.ok, true); state = passed.state; assert.equal(state.status, "awaiting_scenario_critique");
  const stale = transitionInterviewV2(state, { type: "scenario_critique", questionId: "q-3", architectureRevision: "rev-1", reviewDigest: "digest-3", critique: "stale" });
  assert.equal(stale.ok, false); assert.equal(stale.code, "REVIEW_STALE");
  const critique = transitionInterviewV2(state, { type: "scenario_critique", questionId: "q-3", architectureRevision: "rev-2", reviewDigest: "digest-3", critique: "The observed bottleneck cleared." });
  assert.equal(critique.ok, true); state = critique.state; assert.equal(state.currentQuestion.slotId, "challenge-edge-case-v2");
  const follow = transitionInterviewV2(state, { type: "follow_up", questionId: "q-3", followUpId: "f-1", answer: "Why did that change help?", createdAt: "fixed" });
  assert.equal(follow.ok, true); assert.equal(follow.state.currentQuestion.slotId, "challenge-edge-case-v2");
  const edge = transitionInterviewV2(state, { type: "answer", questionId: "q-4", answer: "A bounded edge-case answer.", evaluation });
  assert.equal(edge.ok, true); state = edge.state;
  assert.equal(state.currentQuestion.slotId, "live-failure-v2");
  assert.equal(state.status, "awaiting_chat_answer");
  const failure = transitionInterviewV2(state, { type: "answer", questionId: "q-5", answer: "Impact, recovery, remaining limit.", evaluation });
  assert.equal(failure.ok, true); state = failure.state;
  assert.equal(state.status, "completed");
}
console.log("verify-interview-state-v2: ok");
