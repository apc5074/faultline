import "server-only";

import { createGateway } from "ai";

export class AIGatewayConfigurationError extends Error {
  override name = "AIGatewayConfigurationError";
}

function requiredGatewayApiKey(): string {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new AIGatewayConfigurationError("AI Gateway is not configured.");
  }
  return apiKey;
}

/**
 * Create the configured Vercel AI Gateway language model without selecting a
 * provider directly. Model selection remains centralized in AI-003.
 */
export function createGatewayLanguageModel(modelId: string) {
  const normalizedModelId = modelId.trim();
  if (!normalizedModelId) {
    throw new AIGatewayConfigurationError("AI Gateway model is not configured.");
  }

  return createGateway({ apiKey: requiredGatewayApiKey() }).languageModel(normalizedModelId);
}
