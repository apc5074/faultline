"use client";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { componentRegistry } from "@faultline/component-catalog";
import { validateArchitecture, type Architecture } from "@faultline/core";
import {
  buildPhase6InspectorSnapshot,
  invokePhase6InspectorTool,
  safeWebMcpRevision,
  type Phase6InspectorSnapshot,
} from "@faultline/webmcp";
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";

import {
  AgentSessionProvider,
  useAgentContextFactory,
  useAgentSessionState,
  useAgentSessionStore,
  useWebMcpEvidenceSource,
} from "@/features/agent-session/AgentSessionProvider";
import { AGENT_HELP_CHIPS, buildPendingHelpRequest } from "@/features/agent-session/agent-help-templates";
import { createVisualCommandPublisher } from "@/features/agent-session/visual-intent-bridge";
import { clearDevWebMcpTrace, readDevWebMcpTrace, type WebMcpTelemetryEvent } from "@/features/webmcp/webmcp-config";
import { PlaygroundChallengeProvider, usePlaygroundChallenge } from "@/features/architecture-canvas/playground-challenge";

const DEFAULT_ARCHITECTURE: Architecture = {
  version: 1,
  components: [
    {
      id: "traffic-source-start",
      type: "traffic-source",
      config: { label: "Incoming traffic" },
      deployments: [],
      ui: { x: 80, y: 180 },
    },
    {
      id: "service-1",
      type: "service",
      config: { instances: 2 },
      deployments: [],
      ui: { x: 220, y: 180 },
    },
  ],
  connections: [],
};

function registrationLabel(state: Phase6InspectorSnapshot["entries"][number]["registrationState"]): string {
  switch (state) {
    case "registered":
      return "registered";
    case "rejected":
      return "rejected";
    case "unsupported":
      return "unsupported";
    case "skipped":
      return "skipped";
  }
}

export function WebMcpInspector() {
  const [architectureJson, setArchitectureJson] = useState(() => JSON.stringify(DEFAULT_ARCHITECTURE, null, 2));
  const { architecture, architectureError } = useMemo(() => {
    try {
      const parsed = JSON.parse(architectureJson) as unknown;
      const validated = validateArchitecture(parsed);
      if (!validated.success) {
        return {
          architecture: null,
          architectureError: validated.errors.map(({ path, message }) => `${path}: ${message}`).join(" "),
        };
      }
      return { architecture: validated.data, architectureError: null };
    } catch {
      return { architecture: null, architectureError: "Architecture JSON must be valid JSON." };
    }
  }, [architectureJson]);

  return (
    <PlaygroundChallengeProvider>
      <WebMcpInspectorWithChallenge
        architecture={architecture}
        architectureJson={architectureJson}
        architectureError={architectureError}
        onArchitectureJsonChange={setArchitectureJson}
      />
    </PlaygroundChallengeProvider>
  );
}

function WebMcpInspectorWithChallenge(props: ComponentProps<typeof WebMcpInspectorWorkspace>) {
  const { challenge } = usePlaygroundChallenge();
  return (
    <AgentSessionProvider architecture={props.architecture ?? DEFAULT_ARCHITECTURE} challenge={challenge}>
      <WebMcpInspectorWorkspace {...props} />
    </AgentSessionProvider>
  );
}

function WebMcpInspectorWorkspace({
  architecture,
  architectureJson,
  architectureError,
  onArchitectureJsonChange,
}: {
  architecture: Architecture | null;
  architectureJson: string;
  architectureError: string | null;
  onArchitectureJsonChange: (value: string) => void;
}) {
  const registry = useMemo(() => createDefaultCapabilityRegistry(), []);
  const getContext = useAgentContextFactory();
  const evidenceSource = useWebMcpEvidenceSource();
  const sessionStore = useAgentSessionStore();
  const session = useAgentSessionState();
  const onVisualIntent = useMemo(
    () => createVisualCommandPublisher(sessionStore),
    [sessionStore],
  );

  const [snapshot, setSnapshot] = useState<Phase6InspectorSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [selectedToolName, setSelectedToolName] = useState<string>("get_challenge");
  const [inputJson, setInputJson] = useState("{}");
  const [inputError, setInputError] = useState<string | null>(null);
  const [invokeResult, setInvokeResult] = useState<string | null>(null);
  const [invoking, setInvoking] = useState(false);
  const [timingEvents, setTimingEvents] = useState<readonly WebMcpTelemetryEvent[]>([]);
  const [traceEvents, setTraceEvents] = useState<readonly WebMcpTelemetryEvent[]>([]);

  useEffect(() => {
    setTraceEvents(readDevWebMcpTrace().slice(-80));
    const onTelemetry = (event: Event) => {
      const detail = (event as CustomEvent<WebMcpTelemetryEvent>).detail;
      if (detail?.kind === "timing") setTimingEvents((current) => [...current, detail].slice(-40));
      if (detail?.kind === "trace") setTraceEvents((current) => [...current, detail].slice(-80));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "faultline:dev:webmcp-trace:v1") setTraceEvents(readDevWebMcpTrace().slice(-80));
    };
    const onTraceCleared = () => setTraceEvents([]);
    window.addEventListener("faultline:webmcp", onTelemetry);
    window.addEventListener("storage", onStorage);
    window.addEventListener("faultline:webmcp-trace-cleared", onTraceCleared);
    return () => {
      window.removeEventListener("faultline:webmcp", onTelemetry);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("faultline:webmcp-trace-cleared", onTraceCleared);
    };
  }, []);

  const refreshSnapshot = useCallback(async () => {
    if (!architecture) return;
    setLoadingSnapshot(true);
    setSnapshotError(null);
    try {
      const nextSnapshot = await buildPhase6InspectorSnapshot({
        registry,
        getContext,
        development: true,
        onVisualIntent,
      });
      setSnapshot(nextSnapshot);
      setSelectedToolName((current) =>
        nextSnapshot.entries.some((entry) => entry.name === current)
          ? current
          : (nextSnapshot.entries[0]?.name ?? "get_challenge"),
      );
    } catch (error) {
      setSnapshot(null);
      setSnapshotError(error instanceof Error ? error.message : "Could not build inspector snapshot.");
    } finally {
      setLoadingSnapshot(false);
    }
  }, [architecture, getContext, onVisualIntent, registry]);

  useEffect(() => {
    if (architecture) void refreshSnapshot();
  }, [architecture, refreshSnapshot]);

  async function onInvoke() {
    if (!snapshot) return;
    setInputError(null);
    setInvokeResult(null);
    setInvoking(true);
    try {
      const parsedInput = inputJson.trim().length === 0 ? undefined : JSON.parse(inputJson);
      const result = await invokePhase6InspectorTool(snapshot, selectedToolName, parsedInput);
      setInvokeResult(JSON.stringify(result, null, 2));
    } catch (error) {
      if (error instanceof SyntaxError) {
        setInputError("Input must be valid JSON.");
      } else {
        setInvokeResult(
          JSON.stringify(
            {
              ok: false,
              code: "INVALID_INPUT",
              message: error instanceof Error ? error.message : "Invocation failed.",
            },
            null,
            2,
          ),
        );
      }
    } finally {
      setInvoking(false);
    }
  }

  const selectedEntry = snapshot?.entries.find((entry) => entry.name === selectedToolName);
  const readEntries = snapshot?.entries.filter((entry) => entry.mode === "read") ?? [];
  const visualEntries = snapshot?.entries.filter((entry) => entry.mode === "visual") ?? [];
  const currentEvidenceRevision = safeWebMcpRevision(evidenceSource.getEvidenceRevision());
  const registeredTools = new Set(
    traceEvents
      .filter((event) => event.traceName === "tool_registered")
      .map((event) => event.capability)
      .filter((capability): capability is string => typeof capability === "string"),
  );
  const latestInvocation = [...traceEvents].reverse().find((event) => event.traceName === "tool_invoked");
  const latestInvocationIndex = latestInvocation ? traceEvents.lastIndexOf(latestInvocation) : -1;
  const latestCompletion = latestInvocation
    ? traceEvents.slice(latestInvocationIndex + 1).find((event) =>
        event.traceName === "capability_completed"
        && event.capability === latestInvocation.capability
        && event.evidenceRevision === latestInvocation.evidenceRevision,
      )
    : undefined;
  const latestPolicyGateEvent = [...traceEvents].reverse().find((event) =>
    event.traceName === "coaching_policy_required"
    || event.traceName === "coaching_policy_bootstrapped"
    || event.traceName === "coaching_policy_reset",
  );
  const renderToolList = (entries: readonly Phase6InspectorSnapshot["entries"][number][]) => (
    <div className="webmcp-inspector__tool-list">
      {entries.map((entry) => (
        <article
          key={entry.name}
          className={
            entry.name === selectedToolName
              ? "webmcp-inspector__tool webmcp-inspector__tool--selected"
              : "webmcp-inspector__tool"
          }
        >
          <button type="button" className="webmcp-inspector__tool-select" onClick={() => setSelectedToolName(entry.name)}>
            <strong>{entry.name}</strong>
          </button>
          <p>{entry.description}</p>
          <dl className="webmcp-inspector__meta">
            <div>
              <dt>availability</dt>
              <dd>{entry.available ? "available" : "unavailable"}</dd>
            </div>
            <div>
              <dt>registration</dt>
              <dd>{registrationLabel(entry.registrationState)}</dd>
            </div>
            {entry.skipReason ? (
              <div>
                <dt>skip reason</dt>
                <dd>{entry.skipReason}</dd>
              </div>
            ) : null}
            {entry.structuralPredicate ? (
              <div>
                <dt>structural predicate</dt>
                <dd>{entry.structuralPredicate}</dd>
              </div>
            ) : null}
          </dl>
          <details>
            <summary>JSON Schema</summary>
            <pre>{JSON.stringify(entry.inputSchema, null, 2)}</pre>
          </details>
          <details>
            <summary>WebMCP annotations</summary>
            <pre>{JSON.stringify(entry.annotations ?? {}, null, 2)}</pre>
          </details>
        </article>
      ))}
    </div>
  );

  return (
    <main className="webmcp-inspector">
      <header className="webmcp-inspector__header">
        <p className="playground-topbar__wordmark">Faultline</p>
        <h1 className="webmcp-inspector__title">WebMCP inspector</h1>
        <p className="webmcp-inspector__intro">
          Development diagnostics for the resolver-selected external-agent surface. Not linked from normal navigation.
        </p>
      </header>

      <section className="webmcp-inspector__panel" aria-label="Architecture draft">
        <h2>Architecture draft</h2>
        <textarea
          className="webmcp-inspector__textarea"
          value={architectureJson}
          onChange={(event) => onArchitectureJsonChange(event.target.value)}
          rows={12}
          spellCheck={false}
        />
        {architectureError ? <p className="webmcp-inspector__error">{architectureError}</p> : null}
        <button type="button" onClick={() => void refreshSnapshot()} disabled={!architecture || loadingSnapshot}>
          {loadingSnapshot ? "Refreshing…" : "Refresh surface"}
        </button>
      </section>

      {snapshotError ? <p className="webmcp-inspector__error">{snapshotError}</p> : null}

      <section className="webmcp-inspector__panel" aria-label="Performance">
        <h2>Performance</h2>
        <p>Most recent browser-owned timing spans. Values are bounded and contain no architecture or prompt data.</p>
        {timingEvents.length === 0 ? <p>No WebMCP timing spans recorded yet.</p> : (
          <pre>{timingEvents.map((event, index) => `${index + 1}. ${event.name}: ${event.durationMs?.toFixed(2) ?? event.bytes ?? 0}${event.durationMs !== undefined ? " ms" : " bytes"}${event.capability ? ` · ${event.capability}` : ""}`).join("\n")}</pre>
        )}
      </section>

      <section className="webmcp-inspector__panel" aria-label="Safe lifecycle trace">
        <h2>Safe lifecycle trace</h2>
        <button type="button" onClick={clearDevWebMcpTrace}>Clear trace</button>
        <p>Development-only stage events. Inputs and evidence payloads are never retained.</p>
        <p>
          Registration proves only that this page accepted tool definitions. ChatGPT host discovery is separate and cannot be observed from page JavaScript.
        </p>
        <dl className="webmcp-inspector__meta">
          <div>
            <dt>page registration</dt>
            <dd>{registeredTools.size > 0 ? `succeeded · ${registeredTools.size} tools observed` : "not observed"}</dd>
          </div>
          <div>
            <dt>host discovery</dt>
            <dd>{latestInvocation ? "confirmed by invocation" : "unconfirmed · check ChatGPT Site tools"}</dd>
          </div>
          <div>
            <dt>tool invocation</dt>
            <dd>{latestInvocation ? "observed" : "not observed"}</dd>
          </div>
          <div>
            <dt>WebMCP evidence</dt>
            <dd>{latestInvocation ? (latestCompletion ? "invocation completed; inspect its outcome below" : "invocation started; completion not observed") : "No WebMCP evidence obtained"}</dd>
          </div>
          <div>
            <dt>current evidence revision</dt>
            <dd>{currentEvidenceRevision}</dd>
          </div>
          <div>
            <dt>latest invoked capability</dt>
            <dd>{latestInvocation?.capability ?? "none"}</dd>
          </div>
          <div>
            <dt>latest invoked revision</dt>
            <dd>{latestInvocation?.evidenceRevision ?? "none"}</dd>
          </div>
          <div>
            <dt>coaching policy gate</dt>
            <dd>{latestPolicyGateEvent ? `${latestPolicyGateEvent.traceName}${latestPolicyGateEvent.capability ? ` · ${latestPolicyGateEvent.capability}` : ""}` : "not observed"}</dd>
          </div>
        </dl>
        {traceEvents.length === 0 ? <p>No WebMCP lifecycle traces recorded yet.</p> : (
          <pre>{traceEvents.map((event, index) => `${index + 1}. ${event.traceName ?? "trace"}${event.capability ? ` · ${event.capability}` : ""}${event.generation !== undefined ? ` · generation:${event.generation}` : ""}${event.selectorScope ? ` · scope:${event.selectorScope}` : ""}${event.matchedCount !== undefined ? ` · matched:${event.matchedCount}` : ""}${event.retried ? " · retried" : ""}${event.evidenceRevision ? ` · ${event.evidenceRevision}` : ""}${event.targetCount !== undefined ? ` · targets:${event.targetCount}` : ""}${event.reason ? ` · ${event.reason}` : ""}${event.errorCode ? ` · ${event.errorCode}` : ""}`).join("\n")}</pre>
        )}
      </section>

      <section className="webmcp-inspector__panel" aria-label="Session annotations">
        <h2>Session annotations ({session.annotations.length})</h2>
        <pre>{JSON.stringify(session, null, 2)}</pre>
      </section>

      <section className="webmcp-inspector__panel" aria-label="Mock session signals">
        <h2>Mock session signals</h2>
        <div className="webmcp-inspector__controls">
          <span>Focus</span>
          {(architecture?.components ?? []).map((component) => (
            <button
              key={component.id}
              type="button"
              onClick={() => sessionStore.setFocus({ kind: "component", componentId: component.id, source: "selection" })}
            >
              {componentRegistry.has(component.type)
                ? componentRegistry.get(component.type).label
                : component.type}
            </button>
          ))}
          <button type="button" onClick={() => sessionStore.setFocus({ kind: "none" })}>Clear focus</button>
        </div>
        <div className="webmcp-inspector__controls">
          <span>Help template</span>
          {AGENT_HELP_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              disabled={chip.requiresSelection && session.focus.kind !== "component"}
              onClick={() => {
                sessionStore.setPendingHelp(buildPendingHelpRequest(chip, session.focus, session.revision));
              }}
            >
              {chip.label}
            </button>
          ))}
          <button type="button" onClick={() => sessionStore.setPendingHelp(null)}>Clear help</button>
        </div>
      </section>

      {snapshot ? (
        <>
          <p className="webmcp-inspector__status">
            Page registration API: {snapshot.browserSupported ? "available" : "unavailable"} · host discovery: not exposed to page JavaScript · surface: complete semantic registry (production uses the smaller WebMCP profile)
          </p>

          <section className="webmcp-inspector__panel" aria-label="Read tools">
            <h2>Read tools ({readEntries.length})</h2>
            {renderToolList(readEntries)}
          </section>

          <section className="webmcp-inspector__panel" aria-label="Visual tools">
            <h2>Visual tools ({visualEntries.length})</h2>
            {renderToolList(visualEntries)}
          </section>

          {selectedEntry ? (
            <section className="webmcp-inspector__panel" aria-label="Manual invocation">
              <h2>Invoke {selectedEntry.name}</h2>
              <textarea
                className="webmcp-inspector__textarea"
                value={inputJson}
                onChange={(event) => setInputJson(event.target.value)}
                rows={6}
                spellCheck={false}
                placeholder='{"componentId":"service-1"}'
              />
              {inputError ? <p className="webmcp-inspector__error">{inputError}</p> : null}
              <button type="button" onClick={() => void onInvoke()} disabled={invoking}>
                {invoking ? "Invoking…" : "Invoke through adapter"}
              </button>
              {invokeResult ? (
                <details open>
                  <summary>Adapter result</summary>
                  <pre>{invokeResult}</pre>
                </details>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
