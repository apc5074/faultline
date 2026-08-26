export const DEFAULT_AGENT_DAILY_GUEST_LIMIT = 30;
const MAX_AGENT_DAILY_GUEST_LIMIT = 200;

export class AgentUsageConfigurationError extends Error {
  override name = "AgentUsageConfigurationError";
}

export function resolveAgentDailyGuestLimitFromEnv(env: NodeJS.ProcessEnv): number {
  const raw = env.FAULTLINE_AGENT_DAILY_GUEST_LIMIT?.trim();
  if (!raw) return DEFAULT_AGENT_DAILY_GUEST_LIMIT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_AGENT_DAILY_GUEST_LIMIT) {
    throw new AgentUsageConfigurationError(
      `FAULTLINE_AGENT_DAILY_GUEST_LIMIT must be an integer from 1 to ${MAX_AGENT_DAILY_GUEST_LIMIT}.`,
    );
  }
  return value;
}
