import { componentRegistry } from "@faultline/component-catalog";
import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema } from "../schemas.js";
import { evaluateRequirements } from "@faultline/simulator";

/** Temporary Worker slowdown; the canonical architecture is never changed. */
export const slowConsumersCapability: AgentCapability<AgentContext, undefined, CapabilityResult<unknown>> = {
  name: "slow_consumers",
  description: "Run a bounded simulated Worker slowdown and return derived queue/deadline evidence. This never changes architecture or official results.",
  inputSchema: noInputSchema,
  mode: "experiment",
  availableWhen: (context) => context.architecture.components.some((component) => component.type === "worker") && context.simulation?.available === true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, simulated: true, persistent: false },
  execute(context) {
    const architecture = structuredClone(context.architecture);
    for (const component of architecture.components) {
      if (component.type !== "worker") continue;
      const instances = typeof component.config.instances === "number" ? component.config.instances : 1;
      component.config = { ...component.config, instances: Math.max(1, Math.floor(instances / 2)) };
    }
    const result = evaluateRequirements({ architecture, challenge: context.challenge, registry: componentRegistry });
    if (!result.valid) return capabilityError("SIMULATION_UNAVAILABLE", "Slow-consumer simulation could not be evaluated.");
    return capabilityOk({ simulated: true, architectureChanged: false, processing: result.level2?.processing, deadlineCompletionRatio: result.level2?.processingDeadlineCompletionRatio });
  },
};
