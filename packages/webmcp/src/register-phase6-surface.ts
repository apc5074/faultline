import type { AgentCapabilityRegistry } from "@faultline/agent-capabilities";

import { buildPhase6ReadSurface } from "./phase6-read-surface.js";
import type { WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpModelContext, WebMcpRegisterToolOptions } from "./types.js";

export interface RegisterPhase6ReadSurfaceOptions {
  readonly modelContext: WebMcpModelContext;
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  readonly signal: AbortSignal;
  readonly development?: boolean;
}

export interface RegisterPhase6ReadSurfaceResult {
  readonly registeredToolNames: readonly string[];
}

/**
 * Build and register the Phase 6 read-only surface. Registration stops cleanly
 * when the supplied signal is aborted, including after async surface building.
 */
export async function registerPhase6ReadSurface(
  options: RegisterPhase6ReadSurfaceOptions,
): Promise<RegisterPhase6ReadSurfaceResult> {
  const { modelContext, registry, getContext, signal, development = false } = options;
  if (signal.aborted) return { registeredToolNames: [] };

  const surface = await buildPhase6ReadSurface({ registry, getContext, development });
  if (signal.aborted) return { registeredToolNames: [] };

  const registeredToolNames: string[] = [];
  await Promise.all(
    surface.tools.map(async (tool) => {
      if (signal.aborted) return;
      try {
        const registrationOptions: WebMcpRegisterToolOptions = { signal };
        await modelContext.registerTool(tool, registrationOptions);
        if (!signal.aborted) registeredToolNames.push(tool.name);
      } catch {
        // Optional WebMCP registration failures must not affect gameplay.
      }
    }),
  );

  return { registeredToolNames };
}
