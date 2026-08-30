import type { AgentCapabilityRegistry } from "@faultline/agent-capabilities";

import { registerReadWebMcpSurface } from "./register-phase6-surface.js";
import { registerVisualWebMcpSurface } from "./register-visual-surface.js";
import { registerExperimentWebMcpSurface } from "./register-experiment-surface.js";
import type { ExperimentResult } from "@faultline/core";
import type { WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpModelContext } from "./types.js";
import type { VisualIntentHandler } from "./visual-intent.js";

export interface RegisterAgentWebMcpSurfaceOptions {
  readonly modelContext: WebMcpModelContext;
  readonly registry: AgentCapabilityRegistry;
  /** Read live domain and session state for every tool invocation. */
  readonly getContext: WebMcpContextFactory;
  readonly signal: AbortSignal;
  readonly development?: boolean;
  readonly onVisualIntent?: VisualIntentHandler;
  readonly onExperimentResult?: (result: ExperimentResult) => void;
}

export interface RegisterAgentWebMcpSurfaceResult {
  /** Names selected by the shared registry before browser registration. */
  readonly resolvedToolNames: readonly string[];
  readonly registeredToolNames: readonly string[];
  /** Browser rejected these names; never expose exception text to the player. */
  readonly failedToolNames: readonly string[];
  readonly readToolNames: readonly string[];
  readonly visualToolNames: readonly string[];
  readonly experimentToolNames: readonly string[];
}

/**
 * Register Faultline's complete agent surface with one cancellation lifecycle.
 * The shared live context factory deliberately keeps selection/session updates
 * out of the registration key: tools read them only when invoked.
 */
export async function registerAgentWebMcpSurface(
  options: RegisterAgentWebMcpSurfaceOptions,
): Promise<RegisterAgentWebMcpSurfaceResult> {
  const { modelContext, registry, getContext, signal, development = false, onVisualIntent, onExperimentResult } = options;
  if (signal.aborted) {
    return {
      resolvedToolNames: [], registeredToolNames: [], failedToolNames: [],
      readToolNames: [], visualToolNames: [], experimentToolNames: [],
    };
  }

  const [read, visual, experiment] = await Promise.all([
    registerReadWebMcpSurface({ modelContext, registry, getContext, signal, development }),
    registerVisualWebMcpSurface({
      modelContext,
      registry,
      getContext,
      signal,
      development,
      ...(onVisualIntent ? { onVisualIntent } : {}),
    }),
    registerExperimentWebMcpSurface({ modelContext, registry, getContext, signal, development, ...(onExperimentResult ? { onExperimentResult } : {}) }),
  ]);

  return {
    resolvedToolNames: [...read.resolvedToolNames, ...visual.resolvedToolNames, ...experiment.resolvedToolNames],
    registeredToolNames: [...read.registeredToolNames, ...visual.registeredToolNames, ...experiment.registeredToolNames],
    failedToolNames: [...read.failedToolNames, ...visual.failedToolNames, ...experiment.failedToolNames],
    readToolNames: read.registeredToolNames,
    visualToolNames: visual.registeredToolNames,
    experimentToolNames: experiment.registeredToolNames,
  };
}
