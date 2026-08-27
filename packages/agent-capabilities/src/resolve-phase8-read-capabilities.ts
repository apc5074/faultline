import type { AgentCapability } from "./capability.js";
import { PHASE_8_READ_CAPABILITY_NAMES, type Phase8ReadCapabilityName } from "./capability-names.js";
import type { AgentContext } from "./context.js";
import type { AgentCapabilityRegistry } from "./registry.js";
import type { CapabilityResult } from "./result.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;
export interface ResolvePhase8ReadCapabilitiesResult {
  readonly capabilities: readonly RegisteredCapability[];
  readonly names: readonly Phase8ReadCapabilityName[];
  readonly skipped: readonly { name: Phase8ReadCapabilityName; reason: "missing" | "unavailable" }[];
}

export function resolvePhase8ReadCapabilities(registry: AgentCapabilityRegistry, context: AgentContext): ResolvePhase8ReadCapabilitiesResult {
  const capabilities: RegisteredCapability[] = [];
  const names: Phase8ReadCapabilityName[] = [];
  const skipped: Array<ResolvePhase8ReadCapabilitiesResult["skipped"][number]> = [];
  for (const name of PHASE_8_READ_CAPABILITY_NAMES) {
    if (!registry.has(name)) { skipped.push({ name, reason: "missing" }); continue; }
    const capability = registry.get(name);
    if (capability.mode !== "read" || !capability.availableWhen(context)) { skipped.push({ name, reason: "unavailable" }); continue; }
    capabilities.push(capability); names.push(name);
  }
  return { capabilities, names, skipped };
}
