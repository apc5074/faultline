import type { Architecture, ComponentInstance, JsonValue, RegionDeployment } from "./architecture.js";
import type { ExperimentDefinition, ExperimentResult, ExperimentSummary } from "./experiment.js";

export type ArchitectureChange<T> = {
  readonly id: string;
  readonly before?: T;
  readonly after?: T;
};

export type ArchitectureConfigChange = ArchitectureChange<{
  readonly componentId: string;
  readonly type: string;
  readonly config: JsonValue;
}>;

export type ArchitectureDeploymentChange = ArchitectureChange<{
  readonly componentId: string;
  readonly deployment: RegionDeployment;
}>;

/** Ordered semantic differences between two canonical architectures. */
export interface ArchitectureDelta {
  readonly componentsAdded: readonly { readonly id: string; readonly type: string }[];
  readonly componentsRemoved: readonly { readonly id: string; readonly type: string }[];
  readonly connectionsAdded: readonly string[];
  readonly connectionsRemoved: readonly string[];
  readonly configChanges: readonly ArchitectureConfigChange[];
  readonly deploymentsAdded: readonly ArchitectureDeploymentChange[];
  readonly deploymentsRemoved: readonly ArchitectureDeploymentChange[];
  readonly deploymentChanges: readonly ArchitectureDeploymentChange[];
}

export type ArchitectureScenarioUnavailable = {
  readonly valid: false;
  readonly code: string;
  readonly message: string;
  readonly details?: readonly string[];
};

export type ArchitectureScenarioEvidence = ExperimentResult | ArchitectureScenarioUnavailable;
export type ArchitectureNormalEvidence = ExperimentSummary | ArchitectureScenarioUnavailable;

/** Compact, simulator-produced comparison of one baseline and one candidate. */
export interface ArchitectureScenarioComparison {
  readonly scenario: ExperimentDefinition;
  readonly originalArchitectureRevision: string;
  readonly candidateArchitectureRevision: string;
  readonly architectureDelta: ArchitectureDelta;
  readonly originalScenario: ArchitectureScenarioEvidence;
  readonly candidateNormal: ArchitectureNormalEvidence;
  readonly candidateScenario: ArchitectureScenarioEvidence;
  readonly scenarioMetricDelta: {
    readonly p95LatencyMs: number;
    readonly throughputRatio: number;
    readonly headroom: number;
    readonly costMonthlyTotal: number;
  } | null;
  readonly scenarioRequirementDelta: ExperimentResult["delta"]["requirements"] | null;
  readonly simulatorVersion: string;
}

function stableValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function stableComponent(component: ComponentInstance): JsonValue {
  return {
    id: component.id,
    type: component.type,
    config: stableValue(component.config),
    deployments: component.deployments
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((deployment) => ({
        id: deployment.id,
        regionId: deployment.regionId,
        config: stableValue(deployment.config),
      })),
  };
}

function stableConnection(connection: Architecture["connections"][number]): JsonValue {
  return {
    id: connection.id,
    sourceComponentId: connection.sourceComponentId,
    sourcePortId: connection.sourcePortId,
    targetComponentId: connection.targetComponentId,
    targetPortId: connection.targetPortId,
    type: connection.type,
  };
}

/** UI-free, array-order-independent semantic architecture revision. */
export function semanticArchitectureRevision(architecture: Architecture): string {
  return JSON.stringify({
    version: architecture.version,
    components: architecture.components.slice().sort((left, right) => left.id.localeCompare(right.id)).map(stableComponent),
    connections: architecture.connections.slice().sort((left, right) => left.id.localeCompare(right.id)).map(stableConnection),
  });
}

function componentMap(architecture: Architecture): Map<string, ComponentInstance> {
  return new Map(architecture.components.map((component) => [component.id, component]));
}

function deploymentKey(componentId: string, deployment: RegionDeployment): string {
  return `${componentId}:${deployment.id}`;
}

function deploymentRecords(architecture: Architecture): Map<string, { componentId: string; deployment: RegionDeployment }> {
  const records = new Map<string, { componentId: string; deployment: RegionDeployment }>();
  for (const component of architecture.components) {
    for (const deployment of component.deployments) records.set(deploymentKey(component.id, deployment), { componentId: component.id, deployment });
  }
  return records;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left as JsonValue)) === JSON.stringify(stableValue(right as JsonValue));
}

/** Computes a stable semantic delta; UI coordinates and array ordering are ignored. */
export function compareArchitectures(original: Architecture, candidate: Architecture): ArchitectureDelta {
  const originalComponents = componentMap(original);
  const candidateComponents = componentMap(candidate);
  const componentIds = [...new Set([...originalComponents.keys(), ...candidateComponents.keys()])].sort();
  const componentsAdded: { id: string; type: string }[] = [];
  const componentsRemoved: { id: string; type: string }[] = [];
  const configChanges: ArchitectureConfigChange[] = [];
  for (const id of componentIds) {
    const before = originalComponents.get(id);
    const after = candidateComponents.get(id);
    if (!before && after) componentsAdded.push({ id, type: after.type });
    else if (before && !after) componentsRemoved.push({ id, type: before.type });
    else if (before && after && (before.type !== after.type || !sameJson(before.config, after.config))) {
      configChanges.push({
        id,
        before: { componentId: id, type: before.type, config: stableValue(before.config) },
        after: { componentId: id, type: after.type, config: stableValue(after.config) },
      });
    }
  }

  const originalConnections = new Map(original.connections.map((connection) => [connection.id, connection]));
  const candidateConnections = new Map(candidate.connections.map((connection) => [connection.id, connection]));
  const connectionIds = [...new Set([...originalConnections.keys(), ...candidateConnections.keys()])].sort();
  const connectionsAdded: string[] = [];
  const connectionsRemoved: string[] = [];
  for (const id of connectionIds) {
    if (!originalConnections.has(id)) connectionsAdded.push(id);
    else if (!candidateConnections.has(id)) connectionsRemoved.push(id);
    else if (JSON.stringify(stableConnection(originalConnections.get(id)!)) !== JSON.stringify(stableConnection(candidateConnections.get(id)!))) {
      connectionsRemoved.push(id);
      connectionsAdded.push(id);
    }
  }

  const originalDeployments = deploymentRecords(original);
  const candidateDeployments = deploymentRecords(candidate);
  const deploymentIds = [...new Set([...originalDeployments.keys(), ...candidateDeployments.keys()])].sort();
  const deploymentsAdded: ArchitectureDeploymentChange[] = [];
  const deploymentsRemoved: ArchitectureDeploymentChange[] = [];
  const deploymentChanges: ArchitectureDeploymentChange[] = [];
  for (const id of deploymentIds) {
    const before = originalDeployments.get(id);
    const after = candidateDeployments.get(id);
    if (!before && after) deploymentsAdded.push({ id, after: { componentId: after.componentId, deployment: after.deployment } });
    else if (before && !after) deploymentsRemoved.push({ id, before: { componentId: before.componentId, deployment: before.deployment } });
    else if (before && after && !sameJson(before.deployment, after.deployment)) {
      deploymentChanges.push({
        id,
        before: { componentId: before.componentId, deployment: before.deployment },
        after: { componentId: after.componentId, deployment: after.deployment },
      });
    }
  }

  return {
    componentsAdded,
    componentsRemoved,
    connectionsAdded,
    connectionsRemoved,
    configChanges,
    deploymentsAdded,
    deploymentsRemoved,
    deploymentChanges,
  };
}
