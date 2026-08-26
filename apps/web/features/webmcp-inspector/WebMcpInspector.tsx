"use client";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { urlShortenerChallenge } from "@faultline/challenges";
import { validateArchitecture, type Architecture } from "@faultline/core";
import {
  buildPhase6InspectorSnapshot,
  invokePhase6InspectorTool,
  type Phase6InspectorSnapshot,
} from "@faultline/webmcp";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useLiveAgentContextFactory } from "@/lib/agent-context/use-live-agent-context-factory";

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
  const registry = useMemo(() => createDefaultCapabilityRegistry(), []);
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

  const getContext = useLiveAgentContextFactory(architecture ?? DEFAULT_ARCHITECTURE, urlShortenerChallenge);

  const [snapshot, setSnapshot] = useState<Phase6InspectorSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [selectedToolName, setSelectedToolName] = useState<string>("get_challenge");
  const [inputJson, setInputJson] = useState("{}");
  const [inputError, setInputError] = useState<string | null>(null);
  const [invokeResult, setInvokeResult] = useState<string | null>(null);
  const [invoking, setInvoking] = useState(false);

  const refreshSnapshot = useCallback(async () => {
    if (!architecture) return;
    setLoadingSnapshot(true);
    setSnapshotError(null);
    try {
      const nextSnapshot = await buildPhase6InspectorSnapshot({
        registry,
        getContext,
        development: true,
      });
      setSnapshot(nextSnapshot);
      setSelectedToolName((current) =>
        nextSnapshot.entries.some((entry) => entry.name === current)
          ? current
          : (nextSnapshot.entries[0]?.name ?? "get_challenge"),
      );
    } catch (error) {
      setSnapshot(null);
      setSnapshotError(error instanceof Error ? error.message : "Could not build Phase 6 inspector snapshot.");
    } finally {
      setLoadingSnapshot(false);
    }
  }, [architecture, getContext, registry]);

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
          onChange={(event) => setArchitectureJson(event.target.value)}
          rows={12}
          spellCheck={false}
        />
        {architectureError ? <p className="webmcp-inspector__error">{architectureError}</p> : null}
        <button type="button" onClick={() => void refreshSnapshot()} disabled={!architecture || loadingSnapshot}>
          {loadingSnapshot ? "Refreshing…" : "Refresh surface"}
        </button>
      </section>

      {snapshotError ? <p className="webmcp-inspector__error">{snapshotError}</p> : null}

      {snapshot ? (
        <>
          <p className="webmcp-inspector__status">
            Browser WebMCP: {snapshot.browserSupported ? "supported" : "unsupported"}
          </p>

          <section className="webmcp-inspector__panel" aria-label="Resolved tools">
            <h2>Resolved tools ({snapshot.resolvedNames.length})</h2>
            <div className="webmcp-inspector__tool-list">
              {snapshot.entries.map((entry) => (
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
                      <dt>mode</dt>
                      <dd>{entry.mode}</dd>
                    </div>
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
