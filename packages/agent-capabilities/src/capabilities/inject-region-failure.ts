import { componentRegistry } from "@faultline/component-catalog";
import { evaluateExperiment } from "@faultline/simulator";
import { isValidRegion } from "@faultline/core";
import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { injectRegionFailureInputSchema, type InjectRegionFailureInput } from "../schemas.js";
import { decorateExperimentResult } from "../experiment-result.js";

function hasRegionFailurePrerequisites(context: AgentContext): boolean {
  if (context.simulation?.available !== true || context.simulation.regional?.active !== true) return false;
  const regions = new Set(context.architecture.components.filter((c) => c.type === "service")
    .flatMap((c) => c.deployments.map((deployment) => deployment.regionId)).filter(isValidRegion));
  return regions.size >= 2;
}

export const injectRegionFailureCapability: AgentCapability<AgentContext, InjectRegionFailureInput, CapabilityResult<unknown>> = {
  name: "inject_region_failure",
  description: "Run a temporary simulated failure for one deployed region and report rerouting, unavailable dependencies, requirements, and delta evidence. This never changes deployments, region health, architecture, or official results.",
  inputSchema: injectRegionFailureInputSchema,
  mode: "experiment",
  availableWhen: hasRegionFailurePrerequisites,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, simulated: true, persistent: false },
  execute(context, input) {
    const evaluation = evaluateExperiment({ architecture: context.architecture, challenge: context.challenge, registry: componentRegistry, experiment: { type: "region_failure", parameters: { regionId: input.regionId } } });
    return decorateExperimentResult(context, evaluation);
  },
};
