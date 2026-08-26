import assert from "node:assert/strict";

import {
  AgentModelConfigurationError,
  resolveAgentModelIdFromEnv,
} from "../lib/ai/model-config.ts";

assert.equal(resolveAgentModelIdFromEnv({ FAULTLINE_AGENT_MODEL: "openai/gpt-5-nano" }), "openai/gpt-5-nano");
assert.equal(resolveAgentModelIdFromEnv({ FAULTLINE_AGENT_MODEL: "  openai/gpt-5-nano  " }), "openai/gpt-5-nano");
assert.throws(
  () => resolveAgentModelIdFromEnv({}),
  (error) => error instanceof AgentModelConfigurationError,
);
assert.throws(
  () => resolveAgentModelIdFromEnv({ FAULTLINE_AGENT_MODEL: "   " }),
  (error) => error instanceof AgentModelConfigurationError,
);

console.log("verify-ai-model: ok");
