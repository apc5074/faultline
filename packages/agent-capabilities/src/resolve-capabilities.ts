import type { AgentCapability } from "./capability.js";
import {
  BASELINE_READ_CAPABILITY_NAMES,
  isBaselineReadCapabilityName,
  PHASE_7_DYNAMIC_CAPABILITY_NAMES,
  PRODUCTION_CAPABILITY_MANIFEST,
  type ResolvedCapabilityName,
} from "./capability-names.js";
import type { AgentContext } from "./context.js";
import type { AgentCapabilityRegistry } from "./registry.js";
import type { CapabilityResult } from "./result.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

export type ResolveCapabilitySkipReason = "missing" | "unavailable";

export interface ResolveCapabilitySkip {
  readonly name: ResolvedCapabilityName;
  readonly reason: ResolveCapabilitySkipReason;
}

export interface ResolveCapabilitiesResult {
  readonly capabilities: readonly RegisteredCapability[];
  readonly names: readonly ResolvedCapabilityName[];
  readonly skipped: readonly ResolveCapabilitySkip[];
}

export interface ResolveCapabilitiesOptions {
  /**
   * When true, missing required baseline registrations throw instead of being
   * omitted. Production adapters omit safely and record skips.
   */
  readonly development?: boolean;
}

export class BaselineCapabilityConfigurationError extends Error {
  override name = "BaselineCapabilityConfigurationError";
}

function hasValidProductionExposure(capability: RegisteredCapability): boolean {
  const manifest = PRODUCTION_CAPABILITY_MANIFEST.find((entry) => entry.name === capability.name);
  if (!manifest) return true;
  return capability.exposure?.production === true && capability.exposure.group === manifest.group;
}

function resolveOrderedNames(
  registry: AgentCapabilityRegistry,
  context: AgentContext,
  orderedNames: readonly ResolvedCapabilityName[],
  options: ResolveCapabilitiesOptions,
): ResolveCapabilitiesResult {
  const capabilities: RegisteredCapability[] = [];
  const names: ResolvedCapabilityName[] = [];
  const skipped: ResolveCapabilitySkip[] = [];

  for (const name of orderedNames) {
    if (!registry.has(name)) {
      if (isBaselineReadCapabilityName(name)) {
        if (options.development) {
          throw new BaselineCapabilityConfigurationError(
            `Required baseline capability "${name}" is not registered.`,
          );
        }
        skipped.push({ name, reason: "missing" });
      }
      continue;
    }

    const capability = registry.get(name);
    if (!hasValidProductionExposure(capability) && options.development) {
      throw new BaselineCapabilityConfigurationError(`Production capability "${name}" has missing or invalid exposure metadata.`);
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

/**
 * Resolve the architecture-dependent semantic capability surface for one immutable
 * AgentContext snapshot. Pure and deterministic; never mutates registry or context.
 */
export function resolveCapabilities(
  registry: AgentCapabilityRegistry,
  context: AgentContext,
  options: ResolveCapabilitiesOptions = {},
): ResolveCapabilitiesResult {
  const orderedNames = [
    ...BASELINE_READ_CAPABILITY_NAMES,
    ...PHASE_7_DYNAMIC_CAPABILITY_NAMES,
  ] as const;

  return resolveOrderedNames(registry, context, orderedNames, options);
}

/**
 * Stable registration input derived from every registry predicate, schema, and
 * mode. UI adapters may recompute this after a canonical architecture edit;
 * ordinary focus and simulator-result renders leave it unchanged.
 */
export function capabilitySurfaceFingerprint(
  registry: AgentCapabilityRegistry,
  context: AgentContext,
): string {
  return JSON.stringify(
    registry.list().map((capability) => ({
      name: capability.name,
      mode: capability.mode,
      inputSchema: capability.inputSchema.jsonSchema,
      available: capability.availableWhen(context),
    })),
  );
}
