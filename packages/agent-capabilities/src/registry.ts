import type { AgentCapability, CapabilityExecutionOptions } from "./capability.js";
import type { AgentContext } from "./context.js";
import { capabilityCancelled, capabilityError, isCapabilityCancelled, type CapabilityResult } from "./result.js";
import { hasCurrentExperimentConsent } from "./experiment-consent.js";

export class DuplicateCapabilityError extends Error {
  override name = "DuplicateCapabilityError";
}

export class UnknownCapabilityError extends Error {
  override name = "UnknownCapabilityError";
}

type AnyCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

/**
 * Adapter-neutral semantic capability registry.
 * Domain behavior lives in registered capabilities; AI SDK / WebMCP only adapt.
 */
export class AgentCapabilityRegistry {
  readonly #capabilities = new Map<string, AnyCapability>();

  register<TInput, TData>(
    capability: AgentCapability<AgentContext, TInput, CapabilityResult<TData>>,
  ): void {
    if (this.#capabilities.has(capability.name)) {
      throw new DuplicateCapabilityError(`Capability "${capability.name}" is already registered.`);
    }
    this.#capabilities.set(capability.name, capability as AnyCapability);
  }

  get(name: string): AnyCapability {
    const capability = this.#capabilities.get(name);
    if (!capability) throw new UnknownCapabilityError(`Unknown capability "${name}".`);
    return capability;
  }

  has(name: string): boolean {
    return this.#capabilities.has(name);
  }

  list(): readonly AnyCapability[] {
    return [...this.#capabilities.values()];
  }

  available(context: AgentContext): readonly AnyCapability[] {
    return this.list().filter((capability) => capability.availableWhen(context));
  }

  /**
   * Validate input, then execute. Unexpected throws become a generic tool error shape.
   * Does not leak stack traces to adapters.
   */
  async invoke(
    name: string,
    context: AgentContext,
    input: unknown,
    options?: CapabilityExecutionOptions,
  ): Promise<CapabilityResult<unknown>> {
    if (isCapabilityCancelled(options?.signal)) {
      return capabilityCancelled();
    }

    const capability = this.get(name);
    const parsed = capability.inputSchema.safeParse(input);
    if (!parsed.success) {
      return capabilityError("INVALID_INPUT", parsed.errors.join(" ") || "Invalid capability input.");
    }

    if (isCapabilityCancelled(options?.signal)) {
      return capabilityCancelled();
    }

    // A supplied live session means an adapter is asking to run an experiment
    // on behalf of a player. Only the page's human-controlled consent state can
    // authorize it; tool calls themselves cannot create consent.
    if (
      capability.mode === "experiment" &&
      options?.session !== undefined &&
      !hasCurrentExperimentConsent(options.session.experimentConsent, context, capability.name)
    ) {
      return capabilityError("CONSENT_REQUIRED", "Human approval is required for this named simulated experiment.");
    }

    try {
      const result = await capability.execute(context, parsed.data, options);
      if (isCapabilityCancelled(options?.signal)) {
        return capabilityCancelled();
      }
      return result;
    } catch {
      return capabilityError("INVALID_INPUT", `Capability "${name}" failed unexpectedly.`);
    }
  }
}

export function createAgentCapabilityRegistry(
  capabilities: readonly AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>[] = [],
): AgentCapabilityRegistry {
  const registry = new AgentCapabilityRegistry();
  for (const capability of capabilities) registry.register(capability);
  return registry;
}
