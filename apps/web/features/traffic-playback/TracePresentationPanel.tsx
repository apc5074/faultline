"use client";

import { traceRequest, type TraceRequestOutput } from "@faultline/agent-capabilities";
import type { Architecture, ChallengeDefinition } from "@faultline/core";
import { useState } from "react";

import { createAgentContext } from "@/lib/agent-context/create-agent-context";

function hopLabel(hop: TraceRequestOutput["hops"][number]): string {
  const ids = [hop.originRegionId && `from ${hop.originRegionId}`, hop.destinationRegionId && `to ${hop.destinationRegionId}`, hop.componentId, hop.connectionId, hop.deploymentId]
    .filter(Boolean)
    .join(" · ");
  const latency = hop.networkLatencyMs === undefined ? "" : ` · ${hop.networkLatencyMs} ms network`;
  return `${ids || "terminal"}${latency}`;
}

/** Read-only UI over the shared trace_request output. */
export function TracePresentationPanel({
  architecture,
  challenge,
  onFocusComponent,
  onClear,
}: {
  architecture: Architecture;
  challenge: ChallengeDefinition;
  onFocusComponent: (componentId: string) => void;
  onClear: () => void;
}) {
  const [trace, setTrace] = useState<TraceRequestOutput | null>(null);
  const [kind, setKind] = useState<"redirect" | "write">("redirect");

  const runTrace = () => {
    const result = traceRequest(createAgentContext(architecture, challenge), { kind });
    setTrace(result.ok ? result.data : null);
  };

  return (
    <section className="trace-presentation" aria-label="Request trace">
      <div className="trace-presentation__heading">
        <strong>request trace</strong>
        <label>kind <select value={kind} onChange={(event) => setKind(event.target.value as "redirect" | "write")}><option value="redirect">redirect</option><option value="write">write</option></select></label>
        <button type="button" onClick={runTrace}>trace path</button>
        {trace ? <button type="button" onClick={() => { setTrace(null); onClear(); }}>clear trace</button> : null}
      </div>
      {trace ? (
        <ol className="trace-presentation__hops" aria-live="polite">
          {trace.hops.map((hop) => (
            <li key={hop.order}>
              {hop.componentId ? <button type="button" onClick={() => onFocusComponent(hop.componentId!)}>{hop.order}. {hopLabel(hop)}</button> : <span>{hop.order}. {hopLabel(hop)}</span>}
            </li>
          ))}
          {trace.terminalReason ? <li className="trace-presentation__terminal">terminal · {trace.terminalReason}</li> : null}
        </ol>
      ) : <p>Trace follows simulator routing; it does not change the architecture.</p>}
    </section>
  );
}
