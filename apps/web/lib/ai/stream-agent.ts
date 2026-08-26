import { stepCountIs, streamText, type LanguageModel, type ModelMessage } from "ai";
import type { AgentCapabilityRegistry, AgentContext } from "@faultline/agent-capabilities";

import { toAISDKTools } from "./capabilities";
import { createGatewayLanguageModel } from "./gateway";
import { resolveAgentMaxOutputTokens, resolveAgentMaxSteps } from "./limits";
import { resolveAgentModelId } from "./model";
import { buildCoachingPolicy } from "./coaching-policy";

export interface StreamFaultlineAgentInput {
  /** Resolved by the later model/Gateway configuration layer. */
  model: LanguageModel;
  /** Validated by the later agent endpoint before this server-side runner is called. */
  messages: readonly ModelMessage[];
  registry: AgentCapabilityRegistry;
  context: AgentContext;
  /** Supplied by the later centralized coaching policy. */
  instructions?: string;
  abortSignal?: AbortSignal;
  /** Resolved once at the server boundary; capability implementations never manage this. */
  maxSteps: number;
  /** Caps model-generated text, not deterministic capability output. */
  maxOutputTokens: number;
  onEnd?: (event: { model: { modelId: string }; usage: { inputTokens?: number; outputTokens?: number }; toolCalls: readonly unknown[]; steps: readonly unknown[] }) => void | Promise<void>;
  onError?: () => void | Promise<void>;
  onAbort?: (event: { steps: readonly { toolCalls?: readonly unknown[] }[] }) => void | Promise<void>;
}

export type StreamFaultlineGatewayAgentInput = Omit<
  StreamFaultlineAgentInput,
  "model" | "maxSteps" | "maxOutputTokens" | "instructions"
>;

/**
 * Provider-neutral embedded-agent SDK runner. It supplies semantic Faultline
 * tools to AI SDK. The server-owned step count bounds every invocation; model
 * selection and endpoint validation remain separate layers.
 */
export function streamFaultlineAgent({
  model,
  messages,
  registry,
  context,
  instructions,
  abortSignal,
  maxSteps,
  maxOutputTokens,
  onEnd,
  onError,
  onAbort,
}: StreamFaultlineAgentInput) {
  return streamText({
    model,
    messages: [...messages],
    ...(instructions ? { instructions } : {}),
    tools: toAISDKTools(registry, context),
    stopWhen: stepCountIs(maxSteps),
    maxOutputTokens,
    ...(onEnd ? { onEnd } : {}),
    ...(onError ? { onError: () => onError() } : {}),
    ...(onAbort ? { onAbort } : {}),
    ...(abortSignal ? { abortSignal } : {}),
  });
}

/** Stream Faultline's embedded agent through Vercel AI Gateway. */
export function streamFaultlineGatewayAgent(input: StreamFaultlineGatewayAgentInput) {
  return streamFaultlineAgent({
    ...input,
    model: createGatewayLanguageModel(resolveAgentModelId()),
    maxSteps: resolveAgentMaxSteps(),
    maxOutputTokens: resolveAgentMaxOutputTokens(),
    instructions: buildCoachingPolicy(input.context),
  });
}
