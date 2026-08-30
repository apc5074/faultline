import { componentRegistry } from "@faultline/component-catalog";
import { evaluateExperiment } from "@faultline/simulator";
import type { AgentCapability } from "../capability.js";
import { componentsOfType } from "../component-selection.js";
import type { AgentContext } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { injectComponentFailureInputSchema, type FlushCacheInput } from "../schemas.js";
import { decorateExperimentResult } from "../experiment-result.js";

export const injectComponentFailureCapability: AgentCapability<AgentContext, FlushCacheInput, CapabilityResult<unknown>> = {
  name: "inject_component_failure",
  description:
    "Run a temporary simulated failure for one current Service component and report rerouted or unroutable demand. This never changes infrastructure, architecture, challenge data, or official results.",
  inputSchema: injectComponentFailureInputSchema,
  mode: "experiment",
  availableWhen: (context) => context.simulation?.available === true && componentsOfType(context.architecture.components, "service").length > 0,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, simulated: true, persistent: false },
  execute(context, input) {
    const evaluation = evaluateExperiment({
      architecture: context.architecture,
      challenge: context.challenge,
      registry: componentRegistry,
      experiment: { type: "component_failure", parameters: { componentId: input.componentId } },
    });
    return decorateExperimentResult(context, evaluation);
  },
};
