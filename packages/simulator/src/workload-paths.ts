import {
  assertWorkloadCompletionContract,
  checkConnectionCompatibility,
  parseArchitecture,
  type Architecture,
  type ComponentInstance,
  type Connection,
  type WorkloadCompletionContract,
  type WorkloadNodeContract,
  type WorkloadPathStatus,
  type WorkloadFailureCode,
} from "@faultline/core";
import type { ComponentRegistry } from "@faultline/component-catalog";

export interface ResolvedWorkloadPath {
  channelId: string;
  pathId: string;
  componentIds: readonly string[];
  nodeIds: readonly string[];
  connectionIds: readonly string[];
  status: WorkloadPathStatus;
  terminalRuleId?: string;
  failureCode?: WorkloadFailureCode;
  failureReason?: string;
}

export interface WorkloadPathResolution {
  channelId: string;
  paths: readonly ResolvedWorkloadPath[];
  ingressComponentIds: readonly string[];
  visitedComponentIds: readonly string[];
  inactiveComponentIds: readonly string[];
}

type SearchState = {
  component: ComponentInstance;
  node: WorkloadNodeContract;
  componentIds: readonly string[];
  nodeIds: readonly string[];
  connectionIds: readonly string[];
  visitedPairs: ReadonlySet<string>;
};

function roleNames(component: ComponentInstance, registry: ComponentRegistry): readonly string[] {
  const simulation = registry.get(component.type).simulation;
  const role = simulation && typeof simulation.role === "string" ? simulation.role : undefined;
  return role ? [component.type, role] : [component.type];
}

function nodesForComponent(component: ComponentInstance, contract: WorkloadCompletionContract, registry: ComponentRegistry): readonly WorkloadNodeContract[] {
  const roles = new Set(roleNames(component, registry));
  return contract.nodes.filter((node) => node.acceptedRoles.some((role) => roles.has(role)));
}

function transitionMatches(
  transition: WorkloadCompletionContract["transitions"][number],
  from: string,
  to: string,
  connectionType: Connection["type"],
): boolean {
  return transition.from === from && transition.to === to && transition.connectionTypes.includes(connectionType);
}

function connectionIsCompatible(connection: Connection, architecture: Architecture, registry: ComponentRegistry): boolean {
  const source = architecture.components.find((component) => component.id === connection.sourceComponentId);
  const target = architecture.components.find((component) => component.id === connection.targetComponentId);
  if (!source || !target || !registry.has(source.type) || !registry.has(target.type)) return false;
  const sourcePort = registry.get(source.type).ports.find((port) => port.id === connection.sourcePortId);
  const targetPort = registry.get(target.type).ports.find((port) => port.id === connection.targetPortId);
  return sourcePort !== undefined && targetPort !== undefined && checkConnectionCompatibility(sourcePort, targetPort, connection.type).valid;
}

function terminalRuleFor(state: SearchState, contract: WorkloadCompletionContract): WorkloadCompletionContract["terminalRules"][number] | undefined {
  return contract.terminalRules
    .filter(
      (rule) =>
        rule.requiredNodeIds.includes(state.node.id) &&
        rule.requiredNodeIds.every((nodeId) => state.nodeIds.includes(nodeId)),
    )
    .sort((left, right) => left.id.localeCompare(right.id))[0];
}

function pathId(channelId: string, componentIds: readonly string[], nodeIds: readonly string[]): string {
  return `${channelId}:${componentIds.join(">")}#${nodeIds.join(">")}`;
}

function failurePath(state: SearchState, code: WorkloadFailureCode, reason: string, channelId: string): ResolvedWorkloadPath {
  return {
    channelId,
    pathId: pathId(channelId, state.componentIds, state.nodeIds),
    componentIds: state.componentIds,
    nodeIds: state.nodeIds,
    connectionIds: state.connectionIds,
    status: "failed",
    failureCode: code,
    failureReason: reason,
  };
}

/**
 * Resolves valid workload branches without applying traffic or resource
 * capacity. Components are matched by catalog role/type, while transitions
 * must exist in both the abstract workload contract and the canonical graph.
 */
export function resolveWorkloadPaths(
  input: {
    architecture: unknown;
    contract: unknown;
    registry: ComponentRegistry;
  },
): WorkloadPathResolution {
  const architecture = parseArchitecture(input.architecture);
  assertWorkloadCompletionContract(input.contract);
  const contract = input.contract;
  const ingress = architecture.components
    .filter((component) => nodesForComponent(component, contract, input.registry).some((node) => contract.ingressRoles.some((role) => roleNames(component, input.registry).includes(role))))
    .sort((left, right) => left.id.localeCompare(right.id));
  const paths: ResolvedWorkloadPath[] = [];
  const visited = new Set<string>();

  const search = (state: SearchState): void => {
    visited.add(state.component.id);
    const terminal = terminalRuleFor(state, contract);
    if (terminal) {
      paths.push({
        channelId: contract.channelId,
        pathId: pathId(contract.channelId, state.componentIds, state.nodeIds),
        componentIds: state.componentIds,
        nodeIds: state.nodeIds,
        connectionIds: state.connectionIds,
        status: "complete",
        terminalRuleId: terminal.id,
      });
    }

    const transitions = contract.transitions
      .filter((transition) => transition.from === state.node.id)
      .sort((left, right) => `${left.to}:${left.branch ?? ""}`.localeCompare(`${right.to}:${right.branch ?? ""}`));
    let advanced = false;
    for (const connection of architecture.connections
      .filter((candidate) => candidate.sourceComponentId === state.component.id)
      .filter((candidate) => connectionIsCompatible(candidate, architecture, input.registry))
      .sort((left, right) => left.id.localeCompare(right.id))) {
      const target = architecture.components.find((component) => component.id === connection.targetComponentId);
      if (!target) continue;
      for (const targetNode of nodesForComponent(target, contract, input.registry)) {
        const transition = transitions.find((candidate) => transitionMatches(candidate, state.node.id, targetNode.id, connection.type));
        if (!transition) continue;
        const pair = `${target.id}:${targetNode.id}`;
        if (state.visitedPairs.has(pair)) {
          paths.push(failurePath(state, "missing_downstream_path", `Cycle prevented completion at component "${target.id}".`, contract.channelId));
          continue;
        }
        advanced = true;
        search({
          component: target,
          node: targetNode,
          componentIds: [...state.componentIds, target.id],
          nodeIds: [...state.nodeIds, targetNode.id],
          connectionIds: [...state.connectionIds, connection.id],
          visitedPairs: new Set([...state.visitedPairs, pair]),
        });
      }
    }

    if (!advanced && !terminal) {
      paths.push(failurePath(state, "missing_downstream_path", `Component "${state.component.id}" has no valid downstream completion path.`, contract.channelId));
    }
  };

  for (const component of ingress) {
    for (const node of nodesForComponent(component, contract, input.registry).filter((candidate) => contract.ingressRoles.some((role) => roleNames(component, input.registry).includes(role)))) {
      search({
        component,
        node,
        componentIds: [component.id],
        nodeIds: [node.id],
        connectionIds: [],
        visitedPairs: new Set([`${component.id}:${node.id}`]),
      });
    }
  }

  const deduped = [...new Map(paths.map((path) => [path.pathId, path])).values()].sort((left, right) => left.pathId.localeCompare(right.pathId));
  const visitedComponentIds = [...visited].sort();
  return {
    channelId: contract.channelId,
    paths: deduped,
    ingressComponentIds: ingress.map((component) => component.id),
    visitedComponentIds,
    inactiveComponentIds: architecture.components.map((component) => component.id).filter((id) => !visited.has(id)).sort(),
  };
}
