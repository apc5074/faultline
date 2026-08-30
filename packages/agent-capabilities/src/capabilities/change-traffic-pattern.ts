import { componentRegistry } from "@faultline/component-catalog";
import { evaluateExperiment } from "@faultline/simulator";
import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { changeTrafficPatternInputSchema, type ChangeTrafficPatternInput } from "../schemas.js";
import { decorateExperimentResult } from "../experiment-result.js";

export const changeTrafficPatternCapability: AgentCapability<AgentContext, ChangeTrafficPatternInput, CapabilityResult<unknown>> = {
  name: "change_traffic_pattern",
  description:
    "Run a temporary simulated hot-key traffic-pattern experiment using one bounded read fraction. This never changes architecture, challenge data, or official results.",
  inputSchema: changeTrafficPatternInputSchema,
  mode: "experiment",
  availableWhen: (context) => context.simulation?.available === true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, simulated: true, persistent: false },
  execute(context, input) {
    const evaluation = evaluateExperiment({
      architecture: context.architecture,
      challenge: context.challenge,
      registry: componentRegistry,
      experiment: { type: "hot_key", parameters: { hotKeyReadFraction: input.hotKeyReadFraction } },
    });
    return decorateExperimentResult(context, evaluation);
  },
};
