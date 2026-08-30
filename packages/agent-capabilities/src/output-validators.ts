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
  const required = REQUIRED_READ_FIELDS[capabilityName];
  if (required) {
    for (const field of required) {
      if (!(field in data)) return `${capabilityName} output missing required field "${field}".`;
    }
  }
  if (capabilityName === "review_current_design" && data.truncated === true && !Array.isArray(data.availableSections)) {
    return "review_current_design truncated output must retain availableSections.";
  }
  return undefined;
}

export function assertValidEnvelope(value: unknown): void {
  if (!validateAgentEvidenceResult(value)) {
    throw new Error("Invalid AgentEvidenceResult envelope.");
  }
}

export { isAgentEvidenceResult };
