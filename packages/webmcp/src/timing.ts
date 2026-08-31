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

export type WebMcpTraceName =
  | "registration_started"
  | "tool_registered"
  | "tool_invoked"
  | "lease_acquired"
  | "capability_completed"
  | "cue_derived"
  | "cue_published"
  | "cue_applied"
  | "cue_rejected";

export interface WebMcpTraceEvent {
  readonly kind: "trace";
  readonly name: WebMcpTraceName;
  readonly capability?: string;
  readonly group?: string;
  readonly inputShape?: readonly string[];
  readonly evidenceRevision?: string;
  readonly outcome?: "success" | "error" | "cancelled" | "superseded";
  readonly errorCode?: string;
  readonly cueKind?: "spotlight" | "path";
  readonly targetCount?: number;
  readonly primaryKind?: string;
  readonly cameraIntent?: string;
  readonly reason?: string;
  readonly framedTarget?: string;
}

export type WebMcpTraceSink = (event: WebMcpTraceEvent) => void;

export function recordWebMcpTrace(sink: WebMcpTraceSink | undefined, event: Omit<WebMcpTraceEvent, "kind">): void {
  try {
    sink?.({ kind: "trace", ...event });
  } catch {
    // Diagnostics must never affect gameplay or tool results.
  }
}

export function createWebMcpTrace(maxEvents = 128): {
  readonly events: readonly WebMcpTraceEvent[];
  readonly sink: WebMcpTraceSink;
  clear(): void;
} {
  const events: WebMcpTraceEvent[] = [];
  return {
    get events() { return events; },
    sink: (event) => { events.push(event); if (events.length > maxEvents) events.splice(0, events.length - maxEvents); },
    clear: () => { events.length = 0; },
  };
}

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
