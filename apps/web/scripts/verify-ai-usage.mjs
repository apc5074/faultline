import assert from "node:assert/strict";

import {
  AgentUsageConfigurationError,
  DEFAULT_AGENT_DAILY_GUEST_LIMIT,
  resolveAgentDailyGuestLimitFromEnv,
} from "../lib/ai/usage-config.ts";

assert.equal(DEFAULT_AGENT_DAILY_GUEST_LIMIT, 30);
assert.equal(resolveAgentDailyGuestLimitFromEnv({}), 30);
assert.equal(resolveAgentDailyGuestLimitFromEnv({ FAULTLINE_AGENT_DAILY_GUEST_LIMIT: " 12 " }), 12);
for (const value of ["0", "1.1", "unlimited", "201"]) {
  assert.throws(
    () => resolveAgentDailyGuestLimitFromEnv({ FAULTLINE_AGENT_DAILY_GUEST_LIMIT: value }),
    (error) => error instanceof AgentUsageConfigurationError,
  );
}

console.log("verify-ai-usage: ok");
