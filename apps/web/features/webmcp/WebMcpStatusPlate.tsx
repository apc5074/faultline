export type WebMcpSurfaceStatus =
  | "unsupported"
  | "registering"
  | "ready"
  | "partial"
  | "failed"
  | "disabled";

export interface WebMcpStatus {
  readonly state: WebMcpSurfaceStatus;
  readonly readToolCount: number;
  readonly visualToolCount: number;
  readonly failedToolCount: number;
  /** True only after a registered tool callback has actually completed. */
  readonly invocationObserved: boolean;
  readonly generation?: number;
}

const STATUS_LABEL: Record<WebMcpSurfaceStatus, string> = {
  unsupported: "Page runtime unsupported",
  registering: "Registering tools",
  ready: "Tools registered",
  partial: "Partial registration",
  failed: "Registration failed",
  disabled: "Agent tools disabled",
};

const STATUS_PROMPT: Record<WebMcpSurfaceStatus, string> = {
  unsupported:
    "Host discovery is unavailable in this page runtime · Optional — your game works without WebMCP",
  registering: "Setting up optional agent tools…",
  ready: "Help:",
  partial: "Some agent tools unavailable — gameplay unaffected",
  failed: "Agent tools unavailable — gameplay unaffected",
  disabled: "Agent tools are temporarily disabled — gameplay unaffected",
};

const STARTER_PROMPTS = [
  "Fetch Faultline's coaching policy first, then use the available tools whenever you answer about my design. Start with review_current_design to inspect the live architecture and simulator evidence; give one grounded finding and one focused question. Do not edit the canvas or invent metrics.",
] as const;

/** Compact, progressive-enhancement status for the external agent surface. */
export function WebMcpStatusPlate({ status }: { status: WebMcpStatus }) {
  return (
    <section
      className={`webmcp-status-plate webmcp-status-plate--${status.state}`}
      aria-label="WebMCP status"
      aria-live="polite"
    >
      <span className="webmcp-status-plate__state">
        WebMCP · {STATUS_LABEL[status.state]}
      </span>
      <span className="webmcp-status-plate__prompt">
        {STATUS_PROMPT[status.state]}
      </span>
      {status.failedToolCount > 0 ? (
        <span className="webmcp-status-plate__prompt">
          {status.failedToolCount} tool{status.failedToolCount === 1 ? "" : "s"}{" "}
          failed to register
        </span>
      ) : null}
      {status.state === "failed" || status.state === "partial" ? (
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new Event("faultline:webmcp-retry"))
          }
        >
          Retry WebMCP
        </button>
      ) : null}
      <a className="webmcp-status-plate__link" href="/webmcp">
        WebMCP guide
      </a>
      <details className="webmcp-status-plate__prompts">
        <summary>Starter prompts</summary>
        <div className="webmcp-status-plate__prompt-list">
          {STARTER_PROMPTS.map((prompt) => (
            <code key={prompt}>{prompt}</code>
          ))}
        </div>
      </details>
    </section>
  );
}
