export class AgentModelConfigurationError extends Error {
  override name = "AgentModelConfigurationError";
}

/** Pure environment boundary so model configuration can be verified without a server runtime. */
export function resolveAgentModelIdFromEnv(env: NodeJS.ProcessEnv): string {
  const modelId = env.FAULTLINE_AGENT_MODEL?.trim();
  if (!modelId) {
    throw new AgentModelConfigurationError("Faultline AI model is not configured.");
  }
  return modelId;
}
