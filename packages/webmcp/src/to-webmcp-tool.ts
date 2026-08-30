import type {
  AgentCapability,
  AgentCapabilityRegistry,
  AgentContext,
  CapabilityResult,
  ClearAnnotationsIntent,
  LiveAgentSnapshot,
  VisualAnnotationIntent,
} from "@faultline/agent-capabilities";
import type { ExperimentResult } from "@faultline/core";
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
import { measureWebMcpTiming, recordWebMcpTiming, serializedWebMcpBytes, type WebMcpTimingSink } from "./timing.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

export type WebMcpContextFactory = () => AgentContext | LiveAgentSnapshot | Promise<AgentContext | LiveAgentSnapshot>;

export interface ToWebMcpToolOptions {
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  /** Log unexpected adapter failures locally in development only. */
  readonly development?: boolean;
  /** Apply visual coaching intents to the client session store before returning to the agent. */
  readonly onVisualIntent?: VisualIntentHandler;
  readonly onExperimentResult?: (result: ExperimentResult) => void;
  readonly timing?: WebMcpTimingSink;
}

/**
 * Adapt one semantic capability into a browser WebMCP tool. Domain execution
 * stays in AgentCapabilityRegistry; this layer only maps WebMCP tool fields.
 */
export function toWebMcpTool(capability: RegisteredCapability, options: ToWebMcpToolOptions): WebMcpTool {
  const { registry, getContext, development = false, onVisualIntent, onExperimentResult, timing } = options;
  const annotations = toWebMcpAnnotations(capability.annotations);

  return {
    name: capability.name,
    description: capability.description,
    inputSchema: capability.inputSchema.jsonSchema,
    ...(annotations ? { annotations } : {}),
    execute: async (input: unknown, executionContext: WebMcpToolExecutionContext) => {
      const startedAt = performance.now();
      if (isCapabilityCancelled(executionContext.signal)) {
        return sanitizeWebMcpCapabilityResult(capabilityCancelled(), capability.name);
      }

      try {
        const snapshot = resolveLiveAgentSnapshot(await measureWebMcpTiming(timing, "context_snapshot_ms", getContext));
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

        const result = await measureWebMcpTiming(timing, "capability_execution_ms", () => registry.invoke(capability.name, context, input, {
          signal: executionContext.signal,
          session,
        }), { capability: capability.name, mode: capability.mode });
        const sanitized = sanitizeWebMcpCapabilityResult(result, capability.name);
        recordWebMcpTiming(timing, { name: "result_bytes", bytes: serializedWebMcpBytes(sanitized), capability: capability.name });
        if (capability.mode === "experiment" && sanitized.ok && onExperimentResult) {
          const data = sanitized.data as { simulated?: boolean };
          if (data.simulated === true) onExperimentResult(sanitized.data as ExperimentResult);
        }
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
      } finally {
        recordWebMcpTiming(timing, { name: "tool_callback_total_ms", durationMs: performance.now() - startedAt, capability: capability.name });
      }
    },
  };
}
