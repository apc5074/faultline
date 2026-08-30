import type { ExperimentResult } from "@faultline/core";
import {
  resolveExperimentCapabilities,
  type AgentCapability,
  type AgentCapabilityRegistry,
  type AgentContext,
  type CapabilityResult,
} from "@faultline/agent-capabilities";
import { resolveLiveAgentSnapshot } from "@faultline/agent-capabilities";
import { toWebMcpTool, type ToWebMcpToolOptions, type WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpTool } from "./types.js";
import type { WebMcpTimingSink } from "./timing.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;
export interface BuildExperimentWebMcpSurfaceOptions { readonly registry: AgentCapabilityRegistry; readonly getContext: WebMcpContextFactory; readonly development?: boolean; readonly onExperimentResult?: (result: ExperimentResult) => void; readonly timing?: WebMcpTimingSink; readonly context?: AgentContext; }
export interface ExperimentWebMcpSurface { readonly tools: readonly WebMcpTool[]; readonly resolvedNames: readonly string[]; readonly skipped: readonly { name: string; reason: "missing" | "unavailable" }[]; }

/** Build the opt-in experiment surface without mixing experiments into read-only tools. */
export async function buildExperimentWebMcpSurface(options: BuildExperimentWebMcpSurfaceOptions): Promise<ExperimentWebMcpSurface> {
  const context = options.context ?? resolveLiveAgentSnapshot(await options.getContext()).context;
  const resolved = resolveExperimentCapabilities(options.registry, context);
  const toolOptions: ToWebMcpToolOptions = {
    registry: options.registry,
    getContext: options.getContext,
    ...(options.development !== undefined ? { development: options.development } : {}),
    ...(options.onExperimentResult ? { onExperimentResult: options.onExperimentResult } : {}),
    ...(options.timing ? { timing: options.timing } : {}),
  };
  const tools = resolved.capabilities
    .filter((capability) => capability.mode === "experiment" && capability.annotations?.destructiveHint !== true)
    .map((capability) => {
      const tool = toWebMcpTool(capability as RegisteredCapability, toolOptions);
      return { ...tool, description: `${tool.description} Requires explicit user intent and inspect-first reasoning; this is simulated only.` };
    });
  return { tools, resolvedNames: resolved.names, skipped: resolved.skipped };
}
