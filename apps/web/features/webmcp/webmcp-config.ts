import { safeWebMcpRevision } from "@faultline/webmcp";

export type WebMcpFeatureState = "enabled" | "disabled";

const DEV_TRACE_STORAGE_KEY = "faultline:dev:webmcp-trace:v1";
const DEV_TRACE_MAX_EVENTS = 200;

/** Public registration-only kill switch; gameplay never depends on this flag. */
export function webMcpFeatureState(): WebMcpFeatureState {
  const value = process.env.NEXT_PUBLIC_FAULTLINE_WEBMCP_ENABLED?.trim().toLowerCase();
  return value === "false" || value === "0" || value === "off" ? "disabled" : "enabled";
}

export type WebMcpTelemetryEvent = {
  readonly kind: "registration_state" | "registration_error" | "timing" | "trace";
  readonly state?: "unsupported" | "registering" | "ready" | "partial" | "failed" | "disabled";
  readonly readToolCount?: number;
  readonly visualToolCount?: number;
  readonly failedToolCount?: number;
  readonly name?: string;
  readonly durationMs?: number;
  readonly bytes?: number;
  readonly mode?: "read" | "visual" | "session";
  readonly capability?: string;
  readonly errorClass?: "registration" | "timeout";
  readonly traceName?: string;
  readonly group?: string;
  readonly generation?: number;
  readonly inputShape?: readonly string[];
  readonly cueKind?: "spotlight" | "path" | "set";
  readonly targetCount?: number;
  readonly evidenceRevision?: string;
  readonly reason?: string;
  readonly selectorScope?: "all" | "topmost";
  readonly matchedCount?: number;
  readonly retried?: boolean;
  readonly errorCode?: string;
  readonly interviewId?: string;
  readonly questionId?: string;
  readonly interviewTransition?: "start" | "get" | "answer" | "follow_up" | "advance" | "prepare_review" | "submit_critique" | "end" | "restart";
  readonly evaluationVerdict?: "correct" | "partial" | "incorrect";
};

/** Emits only allowlisted lifecycle diagnostics; no prompts, architecture, accounts, or payloads. */
export function emitWebMcpTelemetry(event: WebMcpTelemetryEvent): void {
  if (typeof window !== "undefined") {
    const safeEvent = event.evidenceRevision
      ? { ...event, evidenceRevision: safeWebMcpRevision(event.evidenceRevision) }
      : event;
    window.dispatchEvent(new CustomEvent("faultline:webmcp", { detail: safeEvent }));
    if (process.env.NODE_ENV !== "production" && safeEvent.kind === "trace") {
      try {
        const current = readDevWebMcpTrace();
        window.localStorage.setItem(
          DEV_TRACE_STORAGE_KEY,
          JSON.stringify([...current, safeEvent].slice(-DEV_TRACE_MAX_EVENTS)),
        );
      } catch {
        // Diagnostics must never affect gameplay when storage is unavailable.
      }
    }
  }
}

export function readDevWebMcpTrace(): readonly WebMcpTelemetryEvent[] {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEV_TRACE_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((event): event is WebMcpTelemetryEvent => Boolean(event && typeof event === "object" && (event as { kind?: unknown }).kind === "trace"))
      : [];
  } catch {
    return [];
  }
}

export function clearDevWebMcpTrace(): void {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
  try {
    window.localStorage.removeItem(DEV_TRACE_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("faultline:webmcp-trace-cleared"));
  } catch {
    // Diagnostics must never affect gameplay when storage is unavailable.
  }
}
