import type { AgentCapabilityRegistry } from "@faultline/agent-capabilities";
import { buildExperimentWebMcpSurface } from "./experiment-webmcp-surface.js";
import type { WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpModelContext, WebMcpRegisterToolOptions } from "./types.js";
import type { ExperimentResult } from "@faultline/core";

export async function registerExperimentWebMcpSurface(options: { modelContext: WebMcpModelContext; registry: AgentCapabilityRegistry; getContext: WebMcpContextFactory; signal: AbortSignal; development?: boolean; onExperimentResult?: (result: ExperimentResult) => void }): Promise<{ registeredToolNames: readonly string[] }> {
  if (options.signal.aborted) return { registeredToolNames: [] };
  const surface = await buildExperimentWebMcpSurface(options);
  if (options.signal.aborted) return { registeredToolNames: [] };
  const registeredToolNames: string[] = [];
  await Promise.all(surface.tools.map(async (tool) => {
    if (options.signal.aborted) return;
    try { await options.modelContext.registerTool(tool, { signal: options.signal } satisfies WebMcpRegisterToolOptions); if (!options.signal.aborted) registeredToolNames.push(tool.name); } catch { /* Optional surface failures never affect gameplay. */ }
  }));
  return { registeredToolNames };
}
