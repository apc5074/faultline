import type {
  AgentCapability,
  AgentCapabilityRegistry,
  AgentContext,
  CapabilityResult,
  ResolvedCapabilityName,
  PresentationCue,
} from "@faultline/agent-capabilities";
import {
  BaselineCapabilityConfigurationError,
  isBaselineReadCapabilityName,
  resolveCapabilities,
  resolveLiveAgentSnapshot,
  RESOLVED_CAPABILITY_NAME_ORDER,
  WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES,
} from "@faultline/agent-capabilities";

import { toWebMcpTool, type WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpTool } from "./types.js";
import type { WebMcpTimingSink } from "./timing.js";

export type Phase6ReadSurfaceSkipReason =
  | "missing"
  | "ineligible_mode"
  | "ineligible_annotations"
  | "unavailable";

export interface Phase6ReadSurfaceSkip {
  readonly name: ResolvedCapabilityName;
  readonly reason: Phase6ReadSurfaceSkipReason;
}

export interface Phase6ReadSurface {
  readonly tools: readonly WebMcpTool[];
  readonly skipped: readonly Phase6ReadSurfaceSkip[];
  readonly resolvedNames: readonly ResolvedCapabilityName[];
}

export interface BuildPhase6ReadSurfaceOptions {
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  readonly getCurrentEvidenceRevision?: () => string;
  /**
   * When true, missing or ineligible baseline capabilities throw instead of
   * being omitted. Use in development and verification; production mounts omit safely.
   */
  readonly development?: boolean;
  readonly timing?: WebMcpTimingSink;
  readonly onPresentationCue?: (cue: PresentationCue) => void;
  readonly context?: AgentContext;
  readonly profile?: "complete" | "production";
}

export class Phase6SurfaceConfigurationError extends Error {
  override name = "Phase6SurfaceConfigurationError";
}

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

function ineligibleReason(
  capability: RegisteredCapability,
  context: AgentContext,
): Phase6ReadSurfaceSkipReason | undefined {
  if (capability.mode !== "read") return "ineligible_mode";
  if (capability.annotations?.readOnlyHint !== true || capability.annotations?.idempotentHint !== true) {
    return "ineligible_annotations";
  }
  if (!capability.availableWhen(context)) return "unavailable";
  return undefined;
}

function configurationFailure(message: string, development: boolean): never | void {
  if (development) {
    throw new Phase6SurfaceConfigurationError(message);
  }
}

/**
 * Build the resolver-selected read-only WebMCP surface from the semantic registry.
 * Baseline and Phase 7 dynamic capabilities share one resolver-owned contract.
 */
export async function buildAgentReadSurface(
  options: BuildPhase6ReadSurfaceOptions,
): Promise<Phase6ReadSurface> {
  const { registry, getContext, getCurrentEvidenceRevision, development = false, timing, profile = "complete", onPresentationCue } = options;
  const context = options.context ?? resolveLiveAgentSnapshot(await getContext()).context;

  let resolved;
  try {
    resolved = resolveCapabilities(registry, context, { development });
  } catch (error) {
    if (development && error instanceof BaselineCapabilityConfigurationError) {
      throw new Phase6SurfaceConfigurationError(error.message);
    }
    throw error;
  }

  const tools: WebMcpTool[] = [];
  const skipped: Phase6ReadSurfaceSkip[] = [];

  for (const skip of resolved.skipped) {
    const reason = skip.reason;
    if (development && isBaselineReadCapabilityName(skip.name)) {
      configurationFailure(`Resolved surface capability "${skip.name}" is ineligible: ${reason}.`, development);
    }
    skipped.push({ name: skip.name, reason });
  }

  const allowedNames = new Set(profile === "production" ? WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES : RESOLVED_CAPABILITY_NAME_ORDER);
  const orderedCapabilities = profile === "production"
    ? WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES.flatMap((name) => resolved.capabilities.filter((candidate) => candidate.name === name))
    : resolved.capabilities;
  const eligibleCapabilities = orderedCapabilities.filter((candidate) => allowedNames.has(candidate.name as typeof WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES[number]) && !ineligibleReason(candidate, context));
  const availableToolNames = new Set(eligibleCapabilities.map((candidate) => candidate.name));
  for (const capability of orderedCapabilities.filter((candidate) => allowedNames.has(candidate.name as typeof WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES[number]))) {
    const reason = ineligibleReason(capability, context);
    if (reason) {
      configurationFailure(`Resolved surface capability "${capability.name}" is ineligible: ${reason}.`, development);
      skipped.push({ name: capability.name as ResolvedCapabilityName, reason });
      continue;
    }

    tools.push(toWebMcpTool(capability, { registry, getContext, getCurrentEvidenceRevision, availableToolNames, development, timing, ...(onPresentationCue ? { onPresentationCue } : {}) }));
  }

  return {
    tools,
    skipped,
    resolvedNames: (profile === "production" ? WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES.filter((name) => resolved.names.includes(name as ResolvedCapabilityName)) : resolved.names).filter((name) => allowedNames.has(name as typeof WEBMCP_PRODUCTION_READ_CAPABILITY_NAMES[number])) as ResolvedCapabilityName[],
  };
}

/** Documented resolver order for diagnostics and verification. */
export const RESOLVED_READ_SURFACE_CAPABILITY_NAMES = RESOLVED_CAPABILITY_NAME_ORDER;
