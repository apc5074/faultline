import type {
  AgentCapability,
  AgentCapabilityRegistry,
  AgentContext,
  CapabilityResult,
} from "@faultline/agent-capabilities";
import { capabilityCancelled, capabilityError, isCapabilityCancelled } from "@faultline/agent-capabilities";

import { toWebMcpAnnotations } from "./annotations.js";
import { sanitizeWebMcpCapabilityResult, unexpectedWebMcpCapabilityFailure } from "./error-safety.js";
import type { WebMcpTool, WebMcpToolExecutionContext } from "./types.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

export type WebMcpContextFactory = () => AgentContext | Promise<AgentContext>;

export interface ToWebMcpToolOptions {
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  /** Log unexpected adapter failures locally in development only. */
  readonly development?: boolean;
}

/**
 * Adapt one semantic capability into a browser WebMCP tool. Domain execution
 * stays in AgentCapabilityRegistry; this layer only maps WebMCP tool fields.
 */
export function toWebMcpTool(capability: RegisteredCapability, options: ToWebMcpToolOptions): WebMcpTool {
  const { registry, getContext, development = false } = options;
  const annotations = toWebMcpAnnotations(capability.annotations);

  return {
    name: capability.name,
    description: capability.description,
    inputSchema: capability.inputSchema.jsonSchema,
    ...(annotations ? { annotations } : {}),
    execute: async (input: unknown, executionContext: WebMcpToolExecutionContext) => {
      if (isCapabilityCancelled(executionContext.signal)) {
        return sanitizeWebMcpCapabilityResult(capabilityCancelled(), capability.name);
      }

      try {
        const context = await getContext();
        if (isCapabilityCancelled(executionContext.signal)) {
          return sanitizeWebMcpCapabilityResult(capabilityCancelled(), capability.name);
        }

        if (!capability.availableWhen(context)) {
          return sanitizeWebMcpCapabilityResult(
            capabilityError("NOT_FOUND", `Capability "${capability.name}" is not available for the current architecture.`),
            capability.name,
          );
        }

        const result = await registry.invoke(capability.name, context, input, {
          signal: executionContext.signal,
        });
        return sanitizeWebMcpCapabilityResult(result, capability.name);
      } catch (error) {
        return unexpectedWebMcpCapabilityFailure(capability.name, error, development);
      }
    },
  };
}
