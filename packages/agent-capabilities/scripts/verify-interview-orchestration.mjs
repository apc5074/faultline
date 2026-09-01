import assert from "node:assert/strict";

import {
  buildInterviewOrchestrationPrompt,
  classifyInterviewReadiness,
  INTERVIEW_ORCHESTRATION_PROMPT_VERSION,
} from "../dist/index.js";

const prompt = buildInterviewOrchestrationPrompt();
assert.match(prompt, new RegExp(INTERVIEW_ORCHESTRATION_PROMPT_VERSION));
for (const tool of ["start_design_interview", "submit_interview_answer", "follow_up_design_interview", "advance_design_interview"]) {
  assert.match(prompt, new RegExp(tool));
}
assert.match(prompt, /exactly one question/);
assert.match(prompt, /never reveal future questions/i);
assert.match(prompt, /verdict never grants permission/i);
assert.match(prompt, /tool retry/i);
assert.match(prompt, /stale, invalid, or unavailable/i);

assert.equal(classifyInterviewReadiness("yes, next"), "ready");
assert.equal(classifyInterviewReadiness("No, not yet"), "ambiguous");
assert.equal(classifyInterviewReadiness("How does the cache handle a hot key?"), "follow_up");
assert.equal(classifyInterviewReadiness("I think that is right"), "ambiguous");

console.log("verify-interview-orchestration: ok");
