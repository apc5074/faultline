/** Allowlisted browser-owned WebMCP performance events. */
export type WebMcpTimingName =
  | "registration_total_ms"
  | "surface_build_ms"
  | "context_snapshot_ms"
  | "simulator_evaluation_ms"
  | "capability_execution_ms"
  | "tool_callback_total_ms"
  | "result_bytes";

export interface WebMcpTimingEvent {
  readonly kind: "timing";
  readonly name: WebMcpTimingName;
  readonly durationMs?: number;
  readonly bytes?: number;
  readonly mode?: "read" | "visual" | "experiment";
  readonly capability?: string;
}

export type WebMcpTimingSink = (event: WebMcpTimingEvent) => void;

export function recordWebMcpTiming(sink: WebMcpTimingSink | undefined, event: Omit<WebMcpTimingEvent, "kind">): void {
  sink?.({ kind: "timing", ...event });
}

export async function measureWebMcpTiming<T>(
  sink: WebMcpTimingSink | undefined,
  name: WebMcpTimingName,
  work: () => T | Promise<T>,
  extra: Omit<WebMcpTimingEvent, "kind" | "name" | "durationMs"> = {},
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await work();
  } finally {
    recordWebMcpTiming(sink, { name, durationMs: performance.now() - startedAt, ...extra });
  }
}

export function serializedWebMcpBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}
