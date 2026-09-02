import type { CapabilityErrorCode, CapabilityResult } from "@faultline/agent-capabilities";
import { capabilityError } from "@faultline/agent-capabilities";

const CONTROLLED_ERROR_CODES = new Set<CapabilityErrorCode>([
  "NOT_FOUND",
  "SIMULATION_UNAVAILABLE",
  "INVALID_INPUT",
  "CANCELLED",
  "CONSENT_REQUIRED",
  "PRESENTATION_UNAVAILABLE",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when a value matches the controlled capability result contract. */
export function isControlledCapabilityResult(value: unknown): value is CapabilityResult<unknown> {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok === true) return "data" in value;
  return typeof value.code === "string" && typeof value.message === "string" && !("stack" in value) &&
    (!isRecord(value.recovery) || !("stack" in value.recovery));
}

/** Strip unknown fields and coerce unsafe error codes before returning to an external agent. */
export function sanitizeWebMcpCapabilityResult(
  result: unknown,
  toolName: string,
): CapabilityResult<unknown> {
  if (!isControlledCapabilityResult(result)) {
    return capabilityError("INVALID_INPUT", `Capability "${toolName}" failed unexpectedly.`);
  }
  if (result.ok) {
    return { ok: true, data: result.data };
  }
  const code = CONTROLLED_ERROR_CODES.has(result.code) ? result.code : "INVALID_INPUT";
  const recovery = isRecord(result.recovery) &&
    result.recovery.code === code &&
    typeof result.recovery.retryable === "boolean"
    ? {
        code,
        retryable: result.recovery.retryable,
        ...(typeof result.recovery.currentEvidenceRevision === "string" ? { currentEvidenceRevision: result.recovery.currentEvidenceRevision } : {}),
        ...(typeof result.recovery.recoveryTool === "string" ? { recoveryTool: result.recovery.recoveryTool } : {}),
        ...(Array.isArray(result.recovery.choices) && result.recovery.choices.every((choice) => typeof choice === "string") ? { choices: result.recovery.choices } : {}),
      }
    : undefined;
  return { ok: false, code, message: result.message, ...(recovery ? { recovery } : {}) };
}

/** Generic adapter failure with optional development-only diagnostics. */
export function unexpectedWebMcpCapabilityFailure(
  toolName: string,
  error: unknown,
  development: boolean,
): CapabilityResult<never> {
  if (development) {
    console.error(`[WebMCP] Unexpected failure in "${toolName}".`, error);
  }
  return capabilityError("INVALID_INPUT", `Capability "${toolName}" failed unexpectedly.`);
}
