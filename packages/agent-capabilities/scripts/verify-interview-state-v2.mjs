import assert from "node:assert/strict";
import { createInterviewV2State, transitionInterviewV2 } from "../dist/index.js";

const slots = [
  ["request_path", "request-path-v2"], ["component_justification", "component-justification-v2"],
  ["live_scale", "live-scale-v2"], ["challenge_edge_case", "challenge-edge-case-v2"], ["live_failure", "live-failure-v2"],
];
const questions = slots.map(([kind, slotId], index) => ({
  kind, slotId, questionId: `q-${index + 1}`, ordinal: index + 1, prompt: `Question ${index + 1}`, evidenceRevision: "rev-1",
  ...(kind === "live_scale" || kind === "live_failure" ? { targetComponentId: "service-1", calibrationId: `cal-${index + 1}`, coachingObjective: "Pass the bounded objective." } : {}),
}));
const started = createInterviewV2State({ type: "start", interviewId: "i-1", architectureRevision: "rev-1", challengeId: "url-shortener", challengeVersion: 3, simulatorVersion: "sim-1", questions, startedAt: "fixed" });
assert.equal(started.ok, true);
let state = started.state;
const evaluation = { verdict: "partial", strength: "Traced the request.", gap: "Missed one boundary.", betterExplanation: "Trace the current connected path." };
const noAdvance = transitionInterviewV2(state, { type: "scenario_review", questionId: "q-1", architectureRevision: "rev-1", passed: true, reviewDigest: "bad" });
assert.equal(noAdvance.ok, false);
for (const question of ["q-1", "q-2"]) {
  const result = transitionInterviewV2(state, { type: "answer", questionId: question, answer: "A bounded answer.", evaluation });
  assert.equal(result.ok, true); state = result.state;
}
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
console.log("verify-interview-state-v2: ok");
