export type WebMcpSurfaceStatus = "unsupported" | "registering" | "ready" | "partial";

export interface WebMcpStatus {
  readonly state: WebMcpSurfaceStatus;
  readonly readToolCount: number;
  readonly visualToolCount: number;
}

const STATUS_LABEL: Record<WebMcpSurfaceStatus, string> = {
  unsupported: "Unsupported browser",
  registering: "Registering tools",
  ready: "Agent ready",
  partial: "Partial registration",
};

/** Compact, progressive-enhancement status for the external agent surface. */
export function WebMcpStatusPlate({ status }: { status: WebMcpStatus }) {
  return (
    <section className={`webmcp-status-plate webmcp-status-plate--${status.state}`} aria-label="WebMCP status">
      <span className="webmcp-status-plate__state">WebMCP · {STATUS_LABEL[status.state]}</span>
      {status.state !== "unsupported" ? (
        <span className="webmcp-status-plate__tools">
          {status.readToolCount} read · {status.visualToolCount} visual
        </span>
      ) : null}
      <span className="webmcp-status-plate__prompt">Connect your agent via WebMCP</span>
      <a className="webmcp-status-plate__link" href="https://webmcp.dev" target="_blank" rel="noreferrer">
        Docs
      </a>
    </section>
  );
}
