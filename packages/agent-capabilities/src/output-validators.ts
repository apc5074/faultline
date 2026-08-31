import { isAgentEvidenceResult, validateAgentEvidenceResult } from "./evidence-result.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const REQUIRED_READ_FIELDS: Readonly<Record<string, readonly string[]>> = {
  review_current_design: ["focus", "challenge", "reviewRef", "availableSections"],
  expand_design_evidence: ["reviewRef", "sections"],
  inspect_design_entity: ["kind", "entityId", "entityRef"],
  compare_design_evidence: ["baseline", "scope", "current", "baselineSide", "changes", "improvements", "regressions"],
  inspect_component: ["id", "type"],
  get_metrics: [],
  get_cost_breakdown: ["monthlyTotal", "budget"],
  get_architecture: ["components"],
};

/** Validate capability output before WebMCP publication. Returns an error message or undefined. */
export function validateCapabilityOutput(
  capabilityName: string,
  data: unknown,
  enveloped = false,
): string | undefined {
  if (enveloped) {
    if (!validateAgentEvidenceResult(data)) return `${capabilityName} envelope failed validation.`;
    return undefined;
  }
  if (!isRecord(data)) return `${capabilityName} output must be an object.`;
  if (capabilityName === "inspect_component" && isRecord(data.selection)) {
    const selection = data.selection;
    if (typeof selection.matchedCount !== "number" || !Number.isInteger(selection.matchedCount) || selection.matchedCount < 1) {
      return "inspect_component selector output requires a positive integer matchedCount.";
    }
    if (!Array.isArray(selection.resolvedComponentIds) || selection.matchedCount !== selection.resolvedComponentIds.length) {
      return "inspect_component matchedCount must equal resolvedComponentIds length.";
    }
    if (!Array.isArray(data.components)) return "inspect_component selector output requires components.";
    return undefined;
  }
  const required = REQUIRED_READ_FIELDS[capabilityName];
  if (required) {
    for (const field of required) {
      if (!(field in data)) return `${capabilityName} output missing required field "${field}".`;
    }
  }
  if (capabilityName === "review_current_design" && data.truncated === true && !Array.isArray(data.availableSections)) {
    return "review_current_design truncated output must retain availableSections.";
  }
  if (capabilityName === "get_architecture" && isRecord(data.inventory)) {
    const inventory = data.inventory;
    if (!Array.isArray(data.components) || inventory.totalComponents !== data.components.length || inventory.totalConnections !== (Array.isArray(data.connections) ? data.connections.length : -1)) {
      return "get_architecture inventory totals must match the returned arrays.";
    }
    if (!Array.isArray(inventory.componentsByType)) return "get_architecture inventory requires componentsByType.";
    const counted = inventory.componentsByType.reduce((sum, group) => {
      if (!isRecord(group) || typeof group.count !== "number" || !Array.isArray(group.componentIds)) return Number.NaN;
      return sum + group.count;
    }, 0);
    if (counted !== inventory.totalComponents) return "get_architecture inventory counts must sum to totalComponents.";
  }
  return undefined;
}

export function assertValidEnvelope(value: unknown): void {
  if (!validateAgentEvidenceResult(value)) {
    throw new Error("Invalid AgentEvidenceResult envelope.");
  }
}

export { isAgentEvidenceResult };
