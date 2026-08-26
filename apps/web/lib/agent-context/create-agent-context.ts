import type { AgentContext, AgentSimulationEvidence } from "@faultline/agent-capabilities";
import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture, ChallengeDefinition } from "@faultline/core";
import { evaluateRequirements, type RequirementsEvaluationResult } from "@faultline/simulator";

function numericMetrics(value: object): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const [name, metric] of Object.entries(value)) {
    if (typeof metric === "number" && Number.isFinite(metric)) metrics[name] = metric;
  }
  return metrics;
}

function simulationEvidence(result: RequirementsEvaluationResult): AgentSimulationEvidence {
  if (!result.valid) {
    return { available: false, validationErrors: result.errors.map((error) => error.message) };
  }

  const components: Record<string, { metrics: Record<string, number>; state?: string }> = {};
  for (const [componentId, metrics] of Object.entries(result.services)) {
    components[componentId] = { metrics: numericMetrics(metrics), state: metrics.state };
  }
  for (const [componentId, metrics] of Object.entries(result.postgres)) {
    components[componentId] = { metrics: numericMetrics(metrics), state: metrics.state };
  }
  for (const [componentId, metrics] of Object.entries(result.caches)) {
    components[componentId] = { metrics: numericMetrics(metrics) };
  }

  const throughput = result.requirements.find((requirement) => requirement.type === "throughput");
  return {
    available: true,
    components,
    system: {
      redirectP95Ms: result.p95LatencyMs,
      throughputPass: throughput?.passed,
      minimumHeadroom: result.headroom,
    },
    scenarios: { hotKey: { active: result.hotKey.active, passed: result.hotKey.passed } },
  };
}

/** Build one immutable, simulator-grounded capability snapshot from canonical gameplay inputs. */
export function createAgentContext(architecture: Architecture, challenge: ChallengeDefinition): AgentContext {
  const result = evaluateRequirements({ architecture, challenge, registry: componentRegistry });
  return {
    challenge,
    architecture,
    simulation: simulationEvidence(result),
    ...(result.valid ? { cost: result.cost } : {}),
    user: { authenticated: false },
  };
}

export type LiveAgentContextFactory = () => AgentContext;

export interface LiveAgentContextSource {
  readonly getArchitecture: () => Architecture;
  readonly getChallenge: () => ChallengeDefinition;
}

/** Stable callback that reads the latest canonical gameplay state on every invocation. */
export function createLiveAgentContextFactory(source: LiveAgentContextSource): LiveAgentContextFactory {
  return () => createAgentContext(source.getArchitecture(), source.getChallenge());
}
