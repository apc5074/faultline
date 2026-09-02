import type { ComponentRegistry } from "@faultline/component-catalog";
import type {
  Architecture,
  ChallengeDefinition,
  ComponentInstance,
  ComponentInterviewProfile,
  InterviewScenarioCalibration,
  InterviewScenarioCandidate,
  InterviewScenarioCalibrationInput,
  InterviewScenarioWitness,
} from "@faultline/core";
import { evaluateRequirements } from "./requirements.js";
import { evaluateExperiment } from "./experiment.js";

/** Prefer a modest stress band first; fall back when viral load already crushes capacity. */
const SCALE_TRAFFIC_MULTIPLIERS = [
  1.25, 1.5, 2, 2.5, 3, 4, 5, 8, 10, 15, 20, 1.1, 1,
  0.75, 0.5, 0.35, 0.25, 0.2, 0.15, 0.1, 0.075, 0.05, 0.03, 0.02, 0.01,
] as const;

function syncInstancesAcrossDeployments(component: ComponentInstance, instances: number): ComponentInstance {
  if (component.deployments.length === 0) return component;
  if (component.deployments.length === 1) {
    const deployment = component.deployments[0]!;
    return {
      ...component,
      deployments: [{ ...deployment, config: { ...deployment.config, instances } }],
    };
  }
  const currentTotal = component.deployments.reduce((sum, deployment) => {
    const value = deployment.config.instances;
    return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
  }, 0) || component.deployments.length;
  let assigned = 0;
  const deployments = component.deployments.map((deployment, index) => {
    if (index === component.deployments.length - 1) {
      return { ...deployment, config: { ...deployment.config, instances: Math.max(1, instances - assigned) } };
    }
    const current = typeof deployment.config.instances === "number" && Number.isFinite(deployment.config.instances)
      ? deployment.config.instances
      : 1;
    const share = Math.max(1, Math.round((current / currentTotal) * instances));
    assigned += share;
    return { ...deployment, config: { ...deployment.config, instances: share } };
  });
  const sum = deployments.reduce((total, deployment) => total + Number(deployment.config.instances), 0);
  if (sum !== instances) {
    const last = deployments[deployments.length - 1]!;
    deployments[deployments.length - 1] = {
      ...last,
      config: { ...last.config, instances: Math.max(1, Number(last.config.instances) + (instances - sum)) },
    };
  }
  return { ...component, deployments };
}

function cloneWithConfig(architecture: Architecture, componentId: string, path: string, value: number | string): Architecture | undefined {
  if (path.includes(".") || path.length === 0) return undefined;
  const component = architecture.components.find((candidate) => candidate.id === componentId);
  if (!component) return undefined;
  let nextComponent: ComponentInstance = { ...component, config: { ...component.config, [path]: value } };
  if (path === "instances" && typeof value === "number" && Number.isFinite(value)) {
    nextComponent = syncInstancesAcrossDeployments(nextComponent, value);
  }
  return {
    ...architecture,
    components: architecture.components.map((candidate) => (candidate.id === componentId ? nextComponent : candidate)),
  };
}

function targetIsOnPath(architecture: Architecture, targetId: string): boolean {
  return architecture.connections.some((connection) => connection.sourceComponentId === targetId || connection.targetComponentId === targetId);
}

function serviceMetrics(architecture: Architecture, challenge: ChallengeDefinition, registry: ComponentRegistry, trafficMultiplier = 1) {
  const scenarioChallenge = trafficMultiplier === 1
    ? challenge
    : { ...challenge, workload: { ...challenge.workload, requestsPerSecond: challenge.workload.requestsPerSecond * trafficMultiplier } };
  const result = evaluateRequirements({ architecture, challenge: scenarioChallenge, registry });
  return result.valid ? result : undefined;
}

function scaleCandidate(input: InterviewScenarioCalibrationInput, registry: ComponentRegistry, componentId: string, profile: ComponentInterviewProfile): { candidate: InterviewScenarioCandidate; witness: InterviewScenarioWitness } | undefined {
  if (!profile.scale) return undefined;
  const component = input.architecture.components.find((candidate) => candidate.id === componentId);
  if (!component) return undefined;
  const current = component.config[profile.scale.configPath];
  const next = profile.scale.safeValues.find((value) => value !== current && (typeof current !== "number" || typeof value !== "number" || value > current));
  if (next === undefined) return undefined;
  const changed = cloneWithConfig(input.architecture, componentId, profile.scale.configPath, next);
  if (!changed) return undefined;

  for (const trafficMultiplier of SCALE_TRAFFIC_MULTIPLIERS) {
    const stressed = serviceMetrics(input.architecture, input.challenge, registry, trafficMultiplier);
    const improved = serviceMetrics(changed, input.challenge, registry, trafficMultiplier);
    const before = stressed?.services[componentId]?.utilization;
    const after = improved?.services[componentId]?.utilization;
    if (before === undefined || after === undefined || before < 1 || after >= 1) continue;
    return {
      candidate: {
        candidateId: `scale-${componentId}`,
        kind: "scale",
        targetComponentId: componentId,
        targetConfigPath: profile.scale.configPath,
        trafficMultiplier,
        primaryReason: "the target component is saturated under the calibrated demand",
        coachingObjective: "Choose a modest capacity edit and explain why it addresses the observed bottleneck.",
        recoveryEditClasses: ["scale_capacity"],
        earlyCareerEditCap: profile.scale.earlyCareerEditCap,
      },
      witness: { candidateId: `scale-${componentId}`, passingConfigPath: profile.scale.configPath, passingValue: next, hidden: true },
    };
  }
  return undefined;
}

/** Qualify only simulator-modeled component failures that evaluate on the current path. */
function failureCandidate(input: InterviewScenarioCalibrationInput, registry: ComponentRegistry, componentId: string, profile: ComponentInterviewProfile): { candidate: InterviewScenarioCandidate; witness: InterviewScenarioWitness } | undefined {
  if (!profile.failure || !profile.failure.scopes.includes("component")) return undefined;
  const failure = evaluateExperiment({
    architecture: input.architecture,
    challenge: input.challenge,
    registry,
    experiment: { type: "component_failure", parameters: { componentId } },
  });
  if (!failure.ok) return undefined;
  const scale = profile.scale;
  const component = input.architecture.components.find((candidate) => candidate.id === componentId);
  const current = scale && component ? component.config[scale.configPath] : undefined;
  const next = scale && current !== undefined
    ? scale.safeValues.find((value) => value !== current && (typeof current !== "number" || typeof value !== "number" || value > current))
    : undefined;
  return {
    candidate: {
      candidateId: `failure-${componentId}`,
      kind: "failure",
      targetComponentId: componentId,
      failureScope: "component",
      primaryReason: "a modeled component failure affects the current request path",
      coachingObjective: "Recover from the modeled failure with at most two simple edits and explain the remaining limitation.",
      recoveryEditClasses: profile.failure.recoveryEditClasses,
      earlyCareerEditCap: Math.min(2, profile.failure.earlyCareerEditCap),
    },
    witness: {
      candidateId: `failure-${componentId}`,
      hidden: true,
      ...(scale && next !== undefined ? { passingConfigPath: scale.configPath, passingValue: next } : {}),
    },
  };
}

/** Calibrate deterministic, simulator-solvable scale and failure scenarios for live interview slots. */
export function calibrateInterviewScenarios(input: InterviewScenarioCalibrationInput, registry: ComponentRegistry): InterviewScenarioCalibration {
  const entries = input.architecture.components
    .filter((component) => targetIsOnPath(input.architecture, component.id))
    .flatMap((component) => {
      if (!registry.has(component.type)) return [];
      const profile = registry.get(component.type).interview;
      if (!profile) return [];
      const scale = scaleCandidate(input, registry, component.id, profile);
      const failure = failureCandidate(input, registry, component.id, profile);
      return [scale, failure].filter((entry): entry is { candidate: InterviewScenarioCandidate; witness: InterviewScenarioWitness } => entry !== undefined);
    })
    .sort((left, right) => left.candidate.candidateId.localeCompare(right.candidate.candidateId));
  return { architectureRevision: input.architectureRevision, simulatorVersion: input.simulatorVersion, candidates: entries.map((entry) => entry.candidate), witnesses: entries.map((entry) => entry.witness) };
}
