import type { AgentCapability } from "./capability.js";
import { WEBMCP_PRODUCTION_EXPERIMENT_CAPABILITY_NAMES, type Phase8ExperimentCapabilityName } from "./capability-names.js";
import type { AgentContext } from "./context.js";
import type { AgentCapabilityRegistry } from "./registry.js";
import type { CapabilityResult } from "./result.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

export interface ResolveExperimentCapabilitiesResult {
  readonly capabilities: readonly RegisteredCapability[];
  readonly names: readonly Phase8ExperimentCapabilityName[];
  readonly skipped: readonly { name: Phase8ExperimentCapabilityName; reason: "missing" | "unavailable" }[];
}

/** Resolve temporary simulated experiments without mixing them into read-only surfaces. */
export function resolveExperimentCapabilities(
  registry: AgentCapabilityRegistry,
  context: AgentContext,
): ResolveExperimentCapabilitiesResult {
  const capabilities: RegisteredCapability[] = [];
  const names: Phase8ExperimentCapabilityName[] = [];
  const skipped: Array<ResolveExperimentCapabilitiesResult["skipped"][number]> = [];
  for (const name of WEBMCP_PRODUCTION_EXPERIMENT_CAPABILITY_NAMES as readonly Phase8ExperimentCapabilityName[]) {
    if (!registry.has(name)) { skipped.push({ name, reason: "missing" }); continue; }
    const capability = registry.get(name);
    if (capability.mode !== "experiment") { skipped.push({ name, reason: "unavailable" }); continue; }
    if (!capability.availableWhen(context)) { skipped.push({ name, reason: "unavailable" }); continue; }
    capabilities.push(capability); names.push(name);
  }
  return { capabilities, names, skipped };
}
