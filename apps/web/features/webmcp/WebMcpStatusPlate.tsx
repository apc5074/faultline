export type WebMcpSurfaceStatus = "unsupported" | "registering" | "ready" | "partial" | "failed" | "disabled";

export interface WebMcpStatus {
  readonly state: WebMcpSurfaceStatus;
  readonly readToolCount: number;
  readonly visualToolCount: number;
  readonly experimentToolCount: number;
  readonly failedToolCount: number;
  readonly generation?: number;
}

const STATUS_LABEL: Record<WebMcpSurfaceStatus, string> = {
  unsupported: "Unsupported browser",
  registering: "Registering tools",
  ready: "Agent ready",
  partial: "Partial registration",
  failed: "Registration failed",
  disabled: "Agent tools disabled",
};

const STATUS_PROMPT: Record<WebMcpSurfaceStatus, string> = {
  unsupported: "Optional — your game works without WebMCP",
  registering: "Setting up optional agent tools…",
  ready: "Connect your agent via WebMCP",
  partial: "Some agent tools unavailable — gameplay unaffected",
  failed: "Agent tools unavailable — gameplay unaffected",
  disabled: "Agent tools are temporarily disabled — gameplay unaffected",
};

const STARTER_PROMPTS = [
  "Call get_coaching_policy first, then get_challenge. Tell me what evidence you need before reviewing my design.",
  "Call get_session_focus. Inspect the focused component and simulator evidence, then give me one finding and one question.",
] as const;

/** Compact, progressive-enhancement status for the external agent surface. */
export function WebMcpStatusPlate({ status }: { status: WebMcpStatus }) {
  return (
    <section className={`webmcp-status-plate webmcp-status-plate--${status.state}`} aria-label="WebMCP status" aria-live="polite">
      <span className="webmcp-status-plate__state">WebMCP · {STATUS_LABEL[status.state]}</span>
      {status.state !== "unsupported" && status.state !== "disabled" ? (
        <span className="webmcp-status-plate__tools">{status.readToolCount} read · {status.visualToolCount} visual · {status.experimentToolCount} simulated</span>
      ) : null}
      <span className="webmcp-status-plate__prompt">{STATUS_PROMPT[status.state]}</span>
      {status.failedToolCount > 0 ? (
        <span className="webmcp-status-plate__prompt">{status.failedToolCount} tool{status.failedToolCount === 1 ? "" : "s"} failed to register</span>
      ) : null}
      <a className="webmcp-status-plate__link" href="https://webmcp.dev" target="_blank" rel="noreferrer">
        Docs
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
