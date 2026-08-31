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
  WEBMCP_PRODUCTION_VISUAL_CAPABILITY_NAMES,
} from "@faultline/agent-capabilities";

import { toWebMcpTool, type ToWebMcpToolOptions, type WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpTool } from "./types.js";
import type { VisualIntentHandler } from "./visual-intent.js";
import type { PresentationCue } from "@faultline/agent-capabilities";
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
  readonly getCurrentEvidenceRevision?: () => string;
  readonly development?: boolean;
  readonly onVisualIntent?: VisualIntentHandler;
  readonly onPresentationCue?: (cue: PresentationCue) => void;
  readonly timing?: WebMcpTimingSink;
  readonly context?: AgentContext;
  readonly profile?: "complete" | "production";
}

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
  const { registry, getContext, getCurrentEvidenceRevision, development = false, onVisualIntent, onPresentationCue, timing, profile = "complete" } = options;
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
    getCurrentEvidenceRevision,
    development,
    ...(onVisualIntent ? { onVisualIntent } : {}),
    ...(onPresentationCue ? { onPresentationCue } : {}),
    timing,
  };

  const tools: WebMcpTool[] = [];
  const skipped: AgentVisualSurfaceSkip[] = [...resolved.skipped];

  const allowedNames = new Set(profile === "production" ? WEBMCP_PRODUCTION_VISUAL_CAPABILITY_NAMES : RESOLVED_VISUAL_CAPABILITY_NAME_ORDER);
  for (const capability of resolved.capabilities.filter((candidate) => allowedNames.has(candidate.name as typeof WEBMCP_PRODUCTION_VISUAL_CAPABILITY_NAMES[number]))) {
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
    resolvedNames: resolved.names.filter((name) => allowedNames.has(name as typeof WEBMCP_PRODUCTION_VISUAL_CAPABILITY_NAMES[number])),
  };
}

export { RESOLVED_VISUAL_CAPABILITY_NAME_ORDER };
