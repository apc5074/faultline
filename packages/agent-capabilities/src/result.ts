/** Controlled capability outcomes returned to adapters (AI SDK, WebMCP). */
export type CapabilityErrorCode =
  | "NOT_FOUND"
  | "SIMULATION_UNAVAILABLE"
  | "INVALID_INPUT"
  | "CONSENT_REQUIRED"
  | "CANCELLED";

export type CapabilityRecovery = {
  readonly code: CapabilityErrorCode;
  readonly retryable: boolean;
  readonly currentEvidenceRevision?: string;
  readonly requiresUserAction?: "approve_exact_experiment";
  readonly recoveryTool?: string;
};

export type CapabilityResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: CapabilityErrorCode; message: string; recovery?: CapabilityRecovery };

export function capabilityOk<T>(data: T): CapabilityResult<T> {
  return { ok: true, data };
}

export function capabilityError(
  code: CapabilityErrorCode,
  message: string,
  recovery?: Omit<CapabilityRecovery, "code">,
): CapabilityResult<never> {
  return { ok: false, code, message, ...(recovery ? { recovery: { code, ...recovery } } : {}) };
}

export function capabilityCancelled(
  message = "Capability invocation was cancelled.",
): CapabilityResult<never> {
  return capabilityError("CANCELLED", message);
}

/** Returns true when an adapter supplied an already-aborted signal. */
export function isCapabilityCancelled(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}
