/** Controlled capability outcomes returned to adapters (AI SDK, WebMCP). */
export type CapabilityErrorCode =
  | "NOT_FOUND"
  | "SIMULATION_UNAVAILABLE"
  | "INVALID_INPUT"
  | "CANCELLED";

export type CapabilityResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: CapabilityErrorCode; message: string };

export function capabilityOk<T>(data: T): CapabilityResult<T> {
  return { ok: true, data };
}

export function capabilityError(
  code: CapabilityErrorCode,
  message: string,
): CapabilityResult<never> {
  return { ok: false, code, message };
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
