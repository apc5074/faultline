import assert from "node:assert/strict";

import {
  AgentUsageConfigurationError,
  DEFAULT_AGENT_DAILY_GUEST_LIMIT,
  DEFAULT_AGENT_DAILY_NETWORK_LIMIT,
  resolveAgentDailyGuestLimitFromEnv,
  resolveAgentDailyNetworkLimitFromEnv,
} from "../lib/ai/usage-config.ts";

assert.equal(DEFAULT_AGENT_DAILY_GUEST_LIMIT, 30);
assert.equal(resolveAgentDailyGuestLimitFromEnv({}), 30);
assert.equal(resolveAgentDailyGuestLimitFromEnv({ FAULTLINE_AGENT_DAILY_GUEST_LIMIT: " 12 " }), 12);
assert.equal(DEFAULT_AGENT_DAILY_NETWORK_LIMIT, 60);
assert.equal(resolveAgentDailyNetworkLimitFromEnv({}), 60);
assert.equal(resolveAgentDailyNetworkLimitFromEnv({ FAULTLINE_AGENT_DAILY_NETWORK_LIMIT: " 120 " }), 120);
for (const value of ["0", "1.1", "unlimited", "201"]) {
  assert.throws(
    () => resolveAgentDailyGuestLimitFromEnv({ FAULTLINE_AGENT_DAILY_GUEST_LIMIT: value }),
    (error) => error instanceof AgentUsageConfigurationError,
  );
}
for (const value of ["0", "1.1", "unlimited", "1001"]) {
  assert.throws(
    () => resolveAgentDailyNetworkLimitFromEnv({ FAULTLINE_AGENT_DAILY_NETWORK_LIMIT: value }),
    (error) => error instanceof AgentUsageConfigurationError,
  );
}

console.log("verify-ai-usage: ok");
