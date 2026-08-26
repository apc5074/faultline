export const DEFAULT_AGENT_MAX_STEPS = 4;
const MAX_AGENT_MAX_STEPS = 8;
export const DEFAULT_AGENT_MAX_OUTPUT_TOKENS = 350;
const MIN_AGENT_MAX_OUTPUT_TOKENS = 64;
const MAX_AGENT_MAX_OUTPUT_TOKENS = 600;

export class AgentStepLimitConfigurationError extends Error {
  override name = "AgentStepLimitConfigurationError";
}

export class AgentOutputLimitConfigurationError extends Error {
  override name = "AgentOutputLimitConfigurationError";
}

/**
 * Keep the tool loop deliberately short. Four model steps allows an initial
 * inspection plus up to three evidence-gathering follow-ups, while the upper
 * bound prevents an environment typo from restoring autonomous loops.
 */
export function resolveAgentMaxStepsFromEnv(env: NodeJS.ProcessEnv): number {
  const raw = env.FAULTLINE_AGENT_MAX_STEPS?.trim();
  if (!raw) return DEFAULT_AGENT_MAX_STEPS;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_AGENT_MAX_STEPS) {
    throw new AgentStepLimitConfigurationError(
      `FAULTLINE_AGENT_MAX_STEPS must be an integer from 1 to ${MAX_AGENT_MAX_STEPS}.`,
    );
  }
  return value;
}

/** Keep the visible side-panel answer concise while leaving tool results structured. */
export function resolveAgentMaxOutputTokensFromEnv(env: NodeJS.ProcessEnv): number {
  const raw = env.FAULTLINE_AGENT_MAX_OUTPUT_TOKENS?.trim();
  if (!raw) return DEFAULT_AGENT_MAX_OUTPUT_TOKENS;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < MIN_AGENT_MAX_OUTPUT_TOKENS || value > MAX_AGENT_MAX_OUTPUT_TOKENS) {
    throw new AgentOutputLimitConfigurationError(
      `FAULTLINE_AGENT_MAX_OUTPUT_TOKENS must be an integer from ${MIN_AGENT_MAX_OUTPUT_TOKENS} to ${MAX_AGENT_MAX_OUTPUT_TOKENS}.`,
    );
  }
  return value;
}
