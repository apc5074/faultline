import "server-only";

import { resolveAgentMaxOutputTokensFromEnv, resolveAgentMaxStepsFromEnv } from "./limits-config";

export {
  AgentOutputLimitConfigurationError,
  AgentStepLimitConfigurationError,
  DEFAULT_AGENT_MAX_OUTPUT_TOKENS,
  DEFAULT_AGENT_MAX_STEPS,
} from "./limits-config";

/** Resolve the single server-owned tool-loop limit for embedded Faultline AI. */
export function resolveAgentMaxSteps(env: NodeJS.ProcessEnv = process.env): number {
  return resolveAgentMaxStepsFromEnv(env);
}

/** Resolve the server-owned cap on model-generated tokens per agent step. */
export function resolveAgentMaxOutputTokens(env: NodeJS.ProcessEnv = process.env): number {
  return resolveAgentMaxOutputTokensFromEnv(env);
}
