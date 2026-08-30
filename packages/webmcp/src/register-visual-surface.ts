import type { AgentCapabilityRegistry } from "@faultline/agent-capabilities";

import { buildVisualWebMcpSurface } from "./agent-visual-surface.js";
import type { WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpModelContext, WebMcpRegisterToolOptions } from "./types.js";
import type { VisualIntentHandler } from "./visual-intent.js";

export interface RegisterVisualWebMcpSurfaceOptions {
  readonly modelContext: WebMcpModelContext;
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  readonly signal: AbortSignal;
  readonly development?: boolean;
  readonly onVisualIntent?: VisualIntentHandler;
}

export interface RegisterVisualWebMcpSurfaceResult {
  readonly resolvedToolNames: readonly string[];
  readonly registeredToolNames: readonly string[];
  readonly failedToolNames: readonly string[];
}

/** Build and register the visual coaching surface. */
export async function registerVisualWebMcpSurface(
  options: RegisterVisualWebMcpSurfaceOptions,
): Promise<RegisterVisualWebMcpSurfaceResult> {
  const { modelContext, registry, getContext, signal, development = false, onVisualIntent } = options;
  if (signal.aborted) return { resolvedToolNames: [], registeredToolNames: [], failedToolNames: [] };

  const surface = await buildVisualWebMcpSurface({
    registry,
    getContext,
    development,
    ...(onVisualIntent ? { onVisualIntent } : {}),
  });
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
