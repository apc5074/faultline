import { componentRegistry } from "@faultline/component-catalog";
import { evaluateExperiment } from "@faultline/simulator";
import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { componentsOfType } from "../component-selection.js";
import { flushCacheInputSchema, type FlushCacheInput } from "../schemas.js";

function hasCacheComponent(context: AgentContext): boolean {
  return componentsOfType(context.architecture.components, "redis").length > 0 ||
    componentsOfType(context.architecture.components, "cdn").length > 0;
}

export const flushCacheCapability: AgentCapability<AgentContext, FlushCacheInput, CapabilityResult<unknown>> = {
  name: "flush_cache",
  description:
    "Run a temporary simulated cold-cache experiment for one current CDN or Redis component. This never changes cache state, architecture, challenge data, or official results.",
  inputSchema: flushCacheInputSchema,
  mode: "experiment",
  availableWhen: hasCacheComponent,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, simulated: true, persistent: false },
  execute(context, input) {
    const evaluation = evaluateExperiment({
      architecture: context.architecture,
      challenge: context.challenge,
      registry: componentRegistry,
      experiment: { type: "cache_flush", parameters: { componentId: input.componentId } },
    });
    if (evaluation.ok) return capabilityOk(evaluation.data);
    return capabilityError(
      evaluation.code === "INVALID_INPUT" ? "INVALID_INPUT" :
        evaluation.code === "UNSUPPORTED_TARGET" ? "NOT_FOUND" : "SIMULATION_UNAVAILABLE",
      evaluation.message,
    );
  },
};
