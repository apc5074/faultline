import "server-only";

import { resolveAgentModelIdFromEnv } from "./model-config";

export { AgentModelConfigurationError } from "./model-config";

/**
 * Resolve Faultline's single configured production model. This is deliberately
 * the only model-name boundary: no provider/model names belong in routes,
 * capabilities, prompts, or React components.
 */
export function resolveAgentModelId(env: NodeJS.ProcessEnv = process.env): string {
  return resolveAgentModelIdFromEnv(env);
}
