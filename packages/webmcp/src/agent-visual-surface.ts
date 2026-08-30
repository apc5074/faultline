import type {
  AgentCapability,
  AgentCapabilityRegistry,
  AgentContext,
  BaselineVisualCapabilityName,
  CapabilityResult,
} from "@faultline/agent-capabilities";
import {
  BaselineCapabilityConfigurationError,
  resolveLiveAgentSnapshot,
  resolveVisualCapabilities,
  RESOLVED_VISUAL_CAPABILITY_NAME_ORDER,
} from "@faultline/agent-capabilities";

import { toWebMcpTool, type ToWebMcpToolOptions, type WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpTool } from "./types.js";
import type { VisualIntentHandler } from "./visual-intent.js";
import type { WebMcpTimingSink } from "./timing.js";

export type AgentVisualSurfaceSkipReason = "missing" | "ineligible_mode" | "ineligible_annotations" | "unavailable";

export interface AgentVisualSurfaceSkip {
  readonly name: BaselineVisualCapabilityName;
  readonly reason: AgentVisualSurfaceSkipReason;
}

export interface AgentVisualSurface {
  readonly tools: readonly WebMcpTool[];
  readonly skipped: readonly AgentVisualSurfaceSkip[];
  readonly resolvedNames: readonly BaselineVisualCapabilityName[];
}

export interface BuildVisualWebMcpSurfaceOptions {
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  readonly development?: boolean;
  readonly onVisualIntent?: VisualIntentHandler;
  readonly timing?: WebMcpTimingSink;
  readonly context?: AgentContext;
}

/** @deprecated Use BuildVisualWebMcpSurfaceOptions. */
export type BuildAgentVisualSurfaceOptions = BuildVisualWebMcpSurfaceOptions;

export class AgentVisualSurfaceConfigurationError extends Error {
  override name = "AgentVisualSurfaceConfigurationError";
}

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

function configurationFailure(message: string, development: boolean): never | void {
  if (development) {
    throw new AgentVisualSurfaceConfigurationError(message);
  }
}

function visualIneligibleReason(
  capability: RegisteredCapability,
  context: AgentContext,
): AgentVisualSurfaceSkipReason | undefined {
  if (capability.mode !== "visual") return "ineligible_mode";
  if (capability.annotations?.destructiveHint === true) return "ineligible_annotations";
  if (!capability.availableWhen(context)) return "unavailable";
  return undefined;
}

/** Build the baseline visual coaching surface for browser WebMCP registration. */
export async function buildVisualWebMcpSurface(
  options: BuildVisualWebMcpSurfaceOptions,
): Promise<AgentVisualSurface> {
  const { registry, getContext, development = false, onVisualIntent, timing } = options;
  const context = options.context ?? resolveLiveAgentSnapshot(await getContext()).context;

  let resolved;
  try {
    resolved = resolveVisualCapabilities(registry, context, { development });
  } catch (error) {
    if (development && error instanceof BaselineCapabilityConfigurationError) {
      throw new AgentVisualSurfaceConfigurationError(error.message);
    }
    throw error;
  }

  const toolOptions: ToWebMcpToolOptions = {
    registry,
    getContext,
    development,
    ...(onVisualIntent ? { onVisualIntent } : {}),
    timing,
  };

  const tools: WebMcpTool[] = [];
  const skipped: AgentVisualSurfaceSkip[] = [...resolved.skipped];

  for (const capability of resolved.capabilities) {
    const reason = visualIneligibleReason(capability, context);
    if (reason) {
      configurationFailure(`Resolved visual capability "${capability.name}" is ineligible: ${reason}.`, development);
      skipped.push({ name: capability.name as BaselineVisualCapabilityName, reason });
      continue;
    }

    tools.push(toWebMcpTool(capability, toolOptions));
  }

  return {
    tools,
    skipped,
    resolvedNames: resolved.names,
  };
}

/** @deprecated Use buildVisualWebMcpSurface. */
export const buildAgentVisualSurface = buildVisualWebMcpSurface;

export { RESOLVED_VISUAL_CAPABILITY_NAME_ORDER };
