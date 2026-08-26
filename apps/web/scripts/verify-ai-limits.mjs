import assert from "node:assert/strict";

import {
  AgentOutputLimitConfigurationError,
  AgentStepLimitConfigurationError,
  DEFAULT_AGENT_MAX_OUTPUT_TOKENS,
  DEFAULT_AGENT_MAX_STEPS,
  resolveAgentMaxOutputTokensFromEnv,
  resolveAgentMaxStepsFromEnv,
} from "../lib/ai/limits-config.ts";

assert.equal(DEFAULT_AGENT_MAX_STEPS, 4);
assert.equal(resolveAgentMaxStepsFromEnv({}), 4);
assert.equal(resolveAgentMaxStepsFromEnv({ FAULTLINE_AGENT_MAX_STEPS: " 3 " }), 3);
assert.equal(resolveAgentMaxStepsFromEnv({ FAULTLINE_AGENT_MAX_STEPS: "8" }), 8);
for (const value of ["0", "1.5", "nine", "9"]) {
  assert.throws(
    () => resolveAgentMaxStepsFromEnv({ FAULTLINE_AGENT_MAX_STEPS: value }),
    (error) => error instanceof AgentStepLimitConfigurationError,
  );
}

assert.equal(DEFAULT_AGENT_MAX_OUTPUT_TOKENS, 350);
assert.equal(resolveAgentMaxOutputTokensFromEnv({}), 350);
assert.equal(resolveAgentMaxOutputTokensFromEnv({ FAULTLINE_AGENT_MAX_OUTPUT_TOKENS: " 256 " }), 256);
assert.equal(resolveAgentMaxOutputTokensFromEnv({ FAULTLINE_AGENT_MAX_OUTPUT_TOKENS: "600" }), 600);
for (const value of ["63", "350.5", "many", "601"]) {
  assert.throws(
    () => resolveAgentMaxOutputTokensFromEnv({ FAULTLINE_AGENT_MAX_OUTPUT_TOKENS: value }),
    (error) => error instanceof AgentOutputLimitConfigurationError,
  );
}

console.log("verify-ai-limits: ok");
