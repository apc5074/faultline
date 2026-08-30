import type { AgentCapabilityRegistry } from "@faultline/agent-capabilities";

import { buildAgentReadSurface } from "./phase6-read-surface.js";
import type { WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpModelContext, WebMcpRegisterToolOptions } from "./types.js";
import type { WebMcpTimingSink } from "./timing.js";

export interface RegisterPhase6ReadSurfaceOptions {
  readonly modelContext: WebMcpModelContext;
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  readonly signal: AbortSignal;
  readonly development?: boolean;
  readonly timing?: WebMcpTimingSink;
}

export interface RegisterPhase6ReadSurfaceResult {
  readonly resolvedToolNames: readonly string[];
  readonly registeredToolNames: readonly string[];
  readonly failedToolNames: readonly string[];
}

/**
 * Build and register the read-only WebMCP surface. Registration stops cleanly
 * when the supplied signal is aborted, including after async surface building.
 */
export async function registerReadWebMcpSurface(
  options: RegisterPhase6ReadSurfaceOptions,
): Promise<RegisterPhase6ReadSurfaceResult> {
  const { modelContext, registry, getContext, signal, development = false, timing } = options;
  if (signal.aborted) return { resolvedToolNames: [], registeredToolNames: [], failedToolNames: [] };

  const surface = await buildAgentReadSurface({ registry, getContext, development, timing });
  if (signal.aborted) return { resolvedToolNames: [], registeredToolNames: [], failedToolNames: [] };

  const registeredToolNames: string[] = [];
  const failedToolNames: string[] = [];
  await Promise.all(
    surface.tools.map(async (tool) => {
      if (signal.aborted) return;
      try {
        const registrationOptions: WebMcpRegisterToolOptions = { signal };
        await modelContext.registerTool(tool, registrationOptions);
        if (!signal.aborted) registeredToolNames.push(tool.name);
      } catch {
        // Optional WebMCP registration failures must not affect gameplay.
        if (!signal.aborted) failedToolNames.push(tool.name);
      }
    }),
  );

  return { resolvedToolNames: surface.resolvedNames, registeredToolNames, failedToolNames };
}

/** @deprecated Use registerReadWebMcpSurface. */
export const registerPhase6ReadSurface = registerReadWebMcpSurface;
