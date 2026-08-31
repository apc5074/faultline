import { safeWebMcpRevision } from "@faultline/webmcp";

export type WebMcpFeatureState = "enabled" | "disabled";

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
  readonly experimentToolCount?: number;
  readonly failedToolCount?: number;
  readonly name?: string;
  readonly durationMs?: number;
  readonly bytes?: number;
  readonly mode?: "read" | "visual" | "experiment";
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
};

/** Emits only allowlisted lifecycle diagnostics; no prompts, architecture, accounts, or payloads. */
export function emitWebMcpTelemetry(event: WebMcpTelemetryEvent): void {
  if (typeof window !== "undefined") {
    const safeEvent = event.evidenceRevision
      ? { ...event, evidenceRevision: safeWebMcpRevision(event.evidenceRevision) }
      : event;
    window.dispatchEvent(new CustomEvent("faultline:webmcp", { detail: safeEvent }));
  }
}
