import type {
  AgentCapability,
  AgentCapabilityRegistry,
  AgentContext,
  CapabilityResult,
  ClearAnnotationsIntent,
  LiveAgentSnapshot,
  VisualAnnotationIntent,
} from "@faultline/agent-capabilities";
import {
  capabilityCancelled,
  capabilityError,
  isCapabilityCancelled,
  resolveLiveAgentSnapshot,
} from "@faultline/agent-capabilities";

import { toWebMcpAnnotations } from "./annotations.js";
import { sanitizeWebMcpCapabilityResult, unexpectedWebMcpCapabilityFailure } from "./error-safety.js";
import type { WebMcpTool, WebMcpToolExecutionContext } from "./types.js";
import { publishVisualIntent, type VisualIntentHandler } from "./visual-intent.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

export type WebMcpContextFactory = () => AgentContext | LiveAgentSnapshot | Promise<AgentContext | LiveAgentSnapshot>;

export interface ToWebMcpToolOptions {
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  /** Log unexpected adapter failures locally in development only. */
  readonly development?: boolean;
  /** Apply visual coaching intents to the client session store before returning to the agent. */
  readonly onVisualIntent?: VisualIntentHandler;
}

/**
 * Adapt one semantic capability into a browser WebMCP tool. Domain execution
 * stays in AgentCapabilityRegistry; this layer only maps WebMCP tool fields.
 */
export function toWebMcpTool(capability: RegisteredCapability, options: ToWebMcpToolOptions): WebMcpTool {
  const { registry, getContext, development = false, onVisualIntent } = options;
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
        const snapshot = resolveLiveAgentSnapshot(await getContext());
        const { context, session } = snapshot;
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
          session,
        });
        const sanitized = sanitizeWebMcpCapabilityResult(result, capability.name);
        if (capability.mode === "visual" && sanitized.ok && onVisualIntent) {
          publishVisualIntent(
            capability.name,
            input,
            sanitized as CapabilityResult<VisualAnnotationIntent | ClearAnnotationsIntent>,
            onVisualIntent,
          );
        }
        return sanitized;
      } catch (error) {
        return unexpectedWebMcpCapabilityFailure(capability.name, error, development);
      }
    },
  };
}
