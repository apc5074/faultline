import type {
  AgentCapability,
  AgentCapabilityRegistry,
  AgentContext,
  CapabilityResult,
} from "@faultline/agent-capabilities";

import { toWebMcpAnnotations } from "./annotations.js";
import type { WebMcpTool, WebMcpToolExecutionContext } from "./types.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

export type WebMcpContextFactory = () => AgentContext | Promise<AgentContext>;

export interface ToWebMcpToolOptions {
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
}

/**
 * Adapt one semantic capability into a browser WebMCP tool. Domain execution
 * stays in AgentCapabilityRegistry; this layer only maps WebMCP tool fields.
 */
export function toWebMcpTool(capability: RegisteredCapability, options: ToWebMcpToolOptions): WebMcpTool {
  const { registry, getContext } = options;
  const annotations = toWebMcpAnnotations(capability.annotations);

  return {
    name: capability.name,
    description: capability.description,
    inputSchema: capability.inputSchema.jsonSchema,
    ...(annotations ? { annotations } : {}),
    execute: async (input: unknown, executionContext: WebMcpToolExecutionContext) => {
      const context = await getContext();
      return registry.invoke(capability.name, context, input, {
        signal: executionContext.signal,
      });
    },
  };
}
