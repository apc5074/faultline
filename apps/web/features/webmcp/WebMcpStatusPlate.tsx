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
  readonly generation?: number;
}

const STATUS_LABEL: Record<WebMcpSurfaceStatus, string> = {
  unsupported: "Unsupported browser",
  registering: "Registering tools",
  ready: "Ready",
  partial: "Partial registration",
  failed: "Registration failed",
  disabled: "Agent tools disabled",
};

const STATUS_PROMPT: Record<WebMcpSurfaceStatus, string> = {
  unsupported: "Optional — your game works without WebMCP",
  registering: "Setting up optional agent tools…",
  ready: "Help:",
  partial: "Some agent tools unavailable — gameplay unaffected",
  failed: "Agent tools unavailable — gameplay unaffected",
  disabled: "Agent tools are temporarily disabled — gameplay unaffected",
};

const STARTER_PROMPTS = [
  "Review my current Faultline design with review_current_design. Give me one grounded finding and one question.",
  "Tell me about all my Postgres components using inspect_component with { selector: { type: \"postgres\", scope: \"all\" } }.",
  "How healthy is my system? Use get_metrics first and give one finding and one question.",
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
        <button type="button" onClick={() => window.dispatchEvent(new Event("faultline:webmcp-retry"))}>
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
