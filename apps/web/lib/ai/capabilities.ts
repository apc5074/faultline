import { dynamicTool, jsonSchema, type Tool } from "ai";
import {
  createEmptyAgentSessionState,
  resolveCapabilities,
  type AgentCapability,
  type AgentCapabilityRegistry,
  type AgentContext,
  type AgentSessionState,
  type CapabilityInputSchema,
  type CapabilityResult,
  type ResolveCapabilitiesOptions,
} from "@faultline/agent-capabilities";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

/** AI SDK's runtime tool set for Faultline's dynamically registered capabilities. */
export type FaultlineAISDKTools = Record<string, Tool>;

export interface ToAISDKToolsOptions extends ResolveCapabilitiesOptions {
  readonly session?: AgentSessionState;
}

function toAISDKInputSchema(inputSchema: CapabilityInputSchema<unknown>) {
  return jsonSchema(inputSchema.jsonSchema, {
    validate(input) {
      const parsed = inputSchema.safeParse(input);
      return parsed.success
        ? { success: true as const, value: parsed.data }
        : { success: false as const, error: new Error(parsed.errors.join(" ") || "Invalid capability input.") };
    },
  });
}

/**
 * Adapt one semantic capability into an AI SDK dynamic tool. Domain execution
 * stays in AgentCapabilityRegistry; this layer only maps SDK tool fields.
 */
export function toAISDKTool(
  capability: RegisteredCapability,
  registry: AgentCapabilityRegistry,
  context: AgentContext,
  session: AgentSessionState = createEmptyAgentSessionState(),
): Tool {
  return dynamicTool({
    description: capability.description,
    inputSchema: toAISDKInputSchema(capability.inputSchema),
    execute: async (input) => registry.invoke(capability.name, context, input, { session }),
  });
}

/** Adapt the resolver-selected semantic surface into one AI SDK tool set. */
export function toAISDKTools(
  registry: AgentCapabilityRegistry,
  context: AgentContext,
  options: ToAISDKToolsOptions = {},
): FaultlineAISDKTools {
  const { session = createEmptyAgentSessionState(), ...resolveOptions } = options;
  const resolved = resolveCapabilities(registry, context, resolveOptions);
  return Object.fromEntries(
    resolved.capabilities.map((capability) => [
      capability.name,
      toAISDKTool(capability, registry, context, session),
    ]),
  );
}
