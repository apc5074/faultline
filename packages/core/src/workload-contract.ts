import type { ConnectionType } from "./architecture.js";

/** Abstract workload node behavior; concrete components provide capabilities. */
export type WorkloadNodeBehavior = "forward" | "dependency" | "buffer" | "consumer" | "terminal";

export interface WorkloadNodeContract {
  id: string;
  acceptedRoles: readonly string[];
  behavior: WorkloadNodeBehavior;
}

export interface WorkloadTransitionContract {
  from: string;
  to: string;
  connectionTypes: readonly ConnectionType[];
  branch?: string;
  required?: boolean;
}

export interface WorkloadTerminalRule {
  id: string;
  requiredNodeIds: readonly string[];
  responseKind: string;
}

/**
 * Challenge-owned completion semantics for one named workload channel.
 * This describes valid graph roles only; it contains no capacity, cost, or
 * latency formulas.
 */
export interface WorkloadCompletionContract {
  channelId: string;
  ingressRoles: readonly string[];
  nodes: readonly WorkloadNodeContract[];
  transitions: readonly WorkloadTransitionContract[];
  terminalRules: readonly WorkloadTerminalRule[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const nodeBehaviors = new Set<WorkloadNodeBehavior>([
  "forward",
  "dependency",
  "buffer",
  "consumer",
  "terminal",
]);
const connectionTypes = new Set<ConnectionType>([
  "request",
  "read_write",
  "object_io",
  "async_work",
]);

/** Validates challenge-authored completion semantics at the domain boundary. */
export function assertWorkloadCompletionContract(
  value: unknown,
): asserts value is WorkloadCompletionContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Workload completion contract must be an object.");
  }
  const contract = value as Record<string, unknown>;
  if (!isNonEmptyString(contract.channelId) || !Array.isArray(contract.ingressRoles) || contract.ingressRoles.length === 0) {
    throw new Error("Workload completion contract requires channelId and ingressRoles.");
  }
  if (!contract.ingressRoles.every(isNonEmptyString)) {
    throw new Error("Workload completion contract ingressRoles must be non-empty strings.");
  }
  if (!Array.isArray(contract.nodes) || contract.nodes.length === 0) {
    throw new Error("Workload completion contract requires nodes.");
  }
  const nodeIds = new Set<string>();
  for (const node of contract.nodes) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error("Workload completion contract has an invalid node.");
    }
    const entry = node as Record<string, unknown>;
    if (!isNonEmptyString(entry.id) || nodeIds.has(entry.id) || !Array.isArray(entry.acceptedRoles) || !entry.acceptedRoles.every(isNonEmptyString) || !nodeBehaviors.has(entry.behavior as WorkloadNodeBehavior)) {
      throw new Error("Workload completion contract has an invalid or duplicate node.");
    }
    nodeIds.add(entry.id);
  }
  if (!Array.isArray(contract.transitions)) {
    throw new Error("Workload completion contract requires transitions.");
  }
  for (const transition of contract.transitions) {
    if (!transition || typeof transition !== "object" || Array.isArray(transition)) {
      throw new Error("Workload completion contract has an invalid transition.");
    }
    const entry = transition as Record<string, unknown>;
    if (!isNonEmptyString(entry.from) || !isNonEmptyString(entry.to) || !nodeIds.has(entry.from) || !nodeIds.has(entry.to) || !Array.isArray(entry.connectionTypes) || entry.connectionTypes.length === 0 || !entry.connectionTypes.every((type) => connectionTypes.has(type as ConnectionType))) {
      throw new Error("Workload completion contract has an invalid transition endpoint or connection type.");
    }
    if (entry.branch !== undefined && !isNonEmptyString(entry.branch)) {
      throw new Error("Workload completion contract transition branch must be a non-empty string.");
    }
    if (entry.required !== undefined && typeof entry.required !== "boolean") {
      throw new Error("Workload completion contract transition required must be boolean.");
    }
  }
  if (!Array.isArray(contract.terminalRules) || contract.terminalRules.length === 0) {
    throw new Error("Workload completion contract requires terminalRules.");
  }
  const terminalIds = new Set<string>();
  for (const terminal of contract.terminalRules) {
    if (!terminal || typeof terminal !== "object" || Array.isArray(terminal)) {
      throw new Error("Workload completion contract has an invalid terminal rule.");
    }
    const entry = terminal as Record<string, unknown>;
    if (!isNonEmptyString(entry.id) || terminalIds.has(entry.id) || !Array.isArray(entry.requiredNodeIds) || entry.requiredNodeIds.length === 0 || !entry.requiredNodeIds.every((id) => isNonEmptyString(id) && nodeIds.has(id)) || !isNonEmptyString(entry.responseKind)) {
      throw new Error("Workload completion contract has an invalid or duplicate terminal rule.");
    }
    terminalIds.add(entry.id);
  }
}

