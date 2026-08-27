import { componentRegistry } from "@faultline/component-catalog";
import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { evaluateExperiment } from "@faultline/simulator";
import { runLoadTestInputSchema, type RunLoadTestInput } from "../schemas.js";

export const runLoadTestCapability: AgentCapability<AgentContext, RunLoadTestInput, CapabilityResult<unknown>> = {
  name: "run_load_test",
  description:
    "Run a bounded, temporary simulated traffic multiplier against the current architecture. This never changes architecture, challenge data, or official results.",
  inputSchema: runLoadTestInputSchema,
  mode: "experiment",
  availableWhen: (context) => context.simulation?.available === true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, simulated: true, persistent: false },
  execute(context, input) {
    const evaluation = evaluateExperiment({
      architecture: context.architecture,
      challenge: context.challenge,
      registry: componentRegistry,
      experiment: { type: "traffic_multiplier", parameters: { multiplier: input.multiplier } },
    });
    if (evaluation.ok) return capabilityOk(evaluation.data);
    return capabilityError(
      evaluation.code === "INVALID_INPUT" ? "INVALID_INPUT" : "SIMULATION_UNAVAILABLE",
      evaluation.message,
    );
  },
};
