import type { AgentCapability, AgentCapabilityRegistry, AgentContext, CapabilityResult } from "@faultline/agent-capabilities";

import { toWebMcpTool, type WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpTool } from "./types.js";

/** Static Phase 6 external-agent allowlist. Phase 7 owns dynamic resolution. */
export const PHASE_6_READ_CAPABILITY_NAMES = [
  "get_challenge",
  "get_requirements",
  "get_architecture",
  "inspect_component",
  "estimate_capacity",
  "get_metrics",
  "get_cost_breakdown",
] as const;

export type Phase6ReadCapabilityName = (typeof PHASE_6_READ_CAPABILITY_NAMES)[number];

export type Phase6ReadSurfaceSkipReason =
  | "missing"
  | "ineligible_mode"
  | "ineligible_annotations"
  | "unavailable";

export interface Phase6ReadSurfaceSkip {
  readonly name: Phase6ReadCapabilityName;
  readonly reason: Phase6ReadSurfaceSkipReason;
}

export interface Phase6ReadSurface {
  readonly tools: readonly WebMcpTool[];
  readonly skipped: readonly Phase6ReadSurfaceSkip[];
}

export interface BuildPhase6ReadSurfaceOptions {
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  /**
   * When true, missing or ineligible allowlisted capabilities throw instead of
   * being omitted. Use in development and verification; production mounts omit safely.
   */
  readonly development?: boolean;
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

function configurationFailure(message: string, development: boolean): void {
  if (development) {
    throw new Phase6SurfaceConfigurationError(message);
  }
}

/**
 * Build the fixed Phase 6 read-only WebMCP surface from the semantic registry.
 * Only allowlisted read capabilities with safe annotations are adapted.
 */
export async function buildPhase6ReadSurface(
  options: BuildPhase6ReadSurfaceOptions,
): Promise<Phase6ReadSurface> {
  const { registry, getContext, development = false } = options;
  const context = await getContext();
  const tools: WebMcpTool[] = [];
  const skipped: Phase6ReadSurfaceSkip[] = [];

  for (const name of PHASE_6_READ_CAPABILITY_NAMES) {
    if (!registry.has(name)) {
      configurationFailure(`Phase 6 surface missing allowlisted capability "${name}".`, development);
      skipped.push({ name, reason: "missing" });
      continue;
    }

    const capability = registry.get(name);
    const reason = ineligibleReason(capability, context);
    if (reason) {
      configurationFailure(`Phase 6 surface capability "${name}" is ineligible: ${reason}.`, development);
      skipped.push({ name, reason });
      continue;
    }

    tools.push(toWebMcpTool(capability, { registry, getContext, development }));
  }

  return { tools, skipped };
}
