import type { AgentCapabilityRegistry } from "@faultline/agent-capabilities";
import { buildExperimentWebMcpSurface } from "./experiment-webmcp-surface.js";
import type { WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpModelContext, WebMcpRegisterToolOptions } from "./types.js";
import type { ExperimentResult } from "@faultline/core";

export interface RegisterExperimentWebMcpSurfaceResult {
  readonly resolvedToolNames: readonly string[];
  readonly registeredToolNames: readonly string[];
  readonly failedToolNames: readonly string[];
}

export async function registerExperimentWebMcpSurface(options: { modelContext: WebMcpModelContext; registry: AgentCapabilityRegistry; getContext: WebMcpContextFactory; signal: AbortSignal; development?: boolean; onExperimentResult?: (result: ExperimentResult) => void }): Promise<RegisterExperimentWebMcpSurfaceResult> {
  if (options.signal.aborted) return { resolvedToolNames: [], registeredToolNames: [], failedToolNames: [] };
  const surface = await buildExperimentWebMcpSurface(options);
  if (options.signal.aborted) return { resolvedToolNames: [], registeredToolNames: [], failedToolNames: [] };
  const registeredToolNames: string[] = [];
  const failedToolNames: string[] = [];
  await Promise.all(surface.tools.map(async (tool) => {
    if (options.signal.aborted) return;
    try { await options.modelContext.registerTool(tool, { signal: options.signal } satisfies WebMcpRegisterToolOptions); if (!options.signal.aborted) registeredToolNames.push(tool.name); } catch { if (!options.signal.aborted) failedToolNames.push(tool.name); }
  }));
  return { resolvedToolNames: surface.resolvedNames, registeredToolNames, failedToolNames };
}
