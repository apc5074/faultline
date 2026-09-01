import {
  createDefaultCapabilityRegistry,
  type AgentCapabilityRegistry,
  type CapabilityResult,
} from "@faultline/agent-capabilities";
import type { Architecture, ChallengeDefinition, ExperimentDefinition, ExperimentResult } from "@faultline/core";

import { createAgentContext } from "../agent-context/create-agent-context.ts";

import { publishExperimentResult, type PublishedExperimentResult } from "./experiment-result-publisher.ts";

let registry: AgentCapabilityRegistry | null = null;

function getExperimentRegistry(): AgentCapabilityRegistry {
  registry ??= createDefaultCapabilityRegistry();
  return registry;
}

export type LaunchExperimentResult =
  | { ok: true; result: ExperimentResult }
  | { ok: false; code: string; message: string };

function experimentInvocation(experiment: ExperimentDefinition): {
  capability: string;
  input: Record<string, unknown>;
} {
  switch (experiment.type) {
    case "traffic_multiplier":
      return { capability: "run_load_test", input: { multiplier: experiment.parameters.multiplier } };
    case "hot_key":
      return {
        capability: "change_traffic_pattern",
        input: { hotKeyReadFraction: experiment.parameters.hotKeyReadFraction },
      };
    case "cache_flush":
      return { capability: "flush_cache", input: { componentId: experiment.parameters.componentId } };
    case "component_failure":
      return {
        capability: "inject_component_failure",
        input: { componentId: experiment.parameters.componentId },
      };
    case "region_failure":
      return { capability: "inject_region_failure", input: { regionId: experiment.parameters.regionId } };
  }
}

function isExperimentResult(value: unknown): value is ExperimentResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "simulated" in value &&
    (value as ExperimentResult).simulated === true &&
    "type" in value &&
    "baseline" in value &&
    "outcome" in value
  );
}

function capabilityFailure(result: Extract<CapabilityResult<unknown>, { ok: false }>): LaunchExperimentResult {
  return { ok: false, code: result.code, message: result.message };
}

/**
 * Shared browser experiment launcher: build live agent context, invoke the
 * registered experiment capability, and return the decorated simulator result.
 * Dev fixtures and WebMCP tools both route through the same capability registry.
 */
export async function launchExperiment(input: {
  architecture: Architecture;
  challenge: ChallengeDefinition;
  experiment: ExperimentDefinition;
}): Promise<LaunchExperimentResult> {
  const context = createAgentContext(input.architecture, input.challenge);
  const { capability, input: capabilityInput } = experimentInvocation(input.experiment);
  const invoked = await getExperimentRegistry().invoke(capability, context, capabilityInput);
  if (!invoked.ok) {
    return capabilityFailure(invoked);
  }
  if (!isExperimentResult(invoked.data)) {
    return {
      ok: false,
      code: "INVALID_RESULT",
      message: "Experiment capability returned an unexpected result.",
    };
  }
  return { ok: true, result: invoked.data };
}

/** Launch through the shared capability path, then publish playback events for the canvas. */
export async function launchAndPublishExperiment(
  input: {
    architecture: Architecture;
    challenge: ChallengeDefinition;
    experiment: ExperimentDefinition;
  },
  onPublished: (published: PublishedExperimentResult) => void,
): Promise<LaunchExperimentResult> {
  const launched = await launchExperiment(input);
  if (launched.ok) {
    publishExperimentResult(launched.result, onPublished);
  }
  return launched;
}
