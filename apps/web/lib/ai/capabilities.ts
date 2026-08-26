import { dynamicTool, jsonSchema, type Tool } from "ai";
import type {
  AgentCapability,
  AgentCapabilityRegistry,
  AgentContext,
  CapabilityInputSchema,
  CapabilityResult,
} from "@faultline/agent-capabilities";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

/** AI SDK's runtime tool set for Faultline's dynamically registered capabilities. */
export type FaultlineAISDKTools = Record<string, Tool>;

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
): Tool {
  return dynamicTool({
    description: capability.description,
    inputSchema: toAISDKInputSchema(capability.inputSchema),
    execute: async (input) => registry.invoke(capability.name, context, input),
  });
}

/** Adapt every currently available semantic capability into one AI SDK tool set. */
export function toAISDKTools(
  registry: AgentCapabilityRegistry,
  context: AgentContext,
): FaultlineAISDKTools {
  return Object.fromEntries(
    registry.available(context).map((capability) => [capability.name, toAISDKTool(capability, registry, context)]),
  );
}
