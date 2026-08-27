import type { AgentCapability } from "./capability.js";
import {
  BASELINE_VISUAL_CAPABILITY_NAMES,
  isBaselineVisualCapabilityName,
  type BaselineVisualCapabilityName,
} from "./capability-names.js";
import type { AgentContext } from "./context.js";
import type { AgentCapabilityRegistry } from "./registry.js";
import type { CapabilityResult } from "./result.js";
import { BaselineCapabilityConfigurationError } from "./resolve-capabilities.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

export type ResolveVisualCapabilitySkipReason = "missing" | "unavailable" | "ineligible_mode";

export interface ResolveVisualCapabilitySkip {
  readonly name: BaselineVisualCapabilityName;
  readonly reason: ResolveVisualCapabilitySkipReason;
}

export interface ResolveVisualCapabilitiesResult {
  readonly capabilities: readonly RegisteredCapability[];
  readonly names: readonly BaselineVisualCapabilityName[];
  readonly skipped: readonly ResolveVisualCapabilitySkip[];
}

export interface ResolveVisualCapabilitiesOptions {
  /**
   * When true, missing required baseline visual registrations throw instead of
   * being omitted. Production adapters omit safely and record skips.
   */
  readonly development?: boolean;
}

/**
 * Resolve the baseline visual coaching surface for one immutable AgentContext snapshot.
 * Pure and deterministic; never mutates registry or context.
 */
export function resolveVisualCapabilities(
  registry: AgentCapabilityRegistry,
  context: AgentContext,
  options: ResolveVisualCapabilitiesOptions = {},
): ResolveVisualCapabilitiesResult {
  const capabilities: RegisteredCapability[] = [];
  const names: BaselineVisualCapabilityName[] = [];
  const skipped: ResolveVisualCapabilitySkip[] = [];

  for (const name of BASELINE_VISUAL_CAPABILITY_NAMES) {
    if (!registry.has(name)) {
      if (options.development) {
        throw new BaselineCapabilityConfigurationError(
          `Required baseline visual capability "${name}" is not registered.`,
        );
      }
      skipped.push({ name, reason: "missing" });
      continue;
    }

    const capability = registry.get(name);
    if (capability.mode !== "visual") {
      if (options.development) {
        throw new BaselineCapabilityConfigurationError(
          `Required baseline visual capability "${name}" is ineligible: ineligible_mode.`,
        );
      }
      skipped.push({ name, reason: "ineligible_mode" });
      continue;
    }

    if (!capability.availableWhen(context)) {
      skipped.push({ name, reason: "unavailable" });
      continue;
    }

    capabilities.push(capability);
    names.push(name);
  }

  return { capabilities, names, skipped };
}

export function isBaselineVisualCapabilityRegistered(name: string): name is BaselineVisualCapabilityName {
  return isBaselineVisualCapabilityName(name);
}
