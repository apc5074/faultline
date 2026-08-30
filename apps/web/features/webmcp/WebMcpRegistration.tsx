"use client";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { getWebMcpModelContext, registerAgentWebMcpSurface, WEBMCP_REGISTRATION_DEADLINE_MS } from "@faultline/webmcp";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  useAgentSessionStore,
  useAgentSessionState,
  useWebMcpEvidenceSource,
} from "@/features/agent-session/AgentSessionProvider";
import { createVisualCommandPublisher } from "@/features/agent-session/visual-intent-bridge";
import type { ExperimentResult, RegionId } from "@faultline/core";
import type { PinnedObservation } from "@faultline/agent-capabilities";
import type { WebMcpStatus } from "./WebMcpStatusPlate";
import { emitWebMcpTelemetry, webMcpFeatureState } from "./webmcp-config";

/**
 * Registers resolver-selected read and visual WebMCP surfaces when the browser supports it.
 * Renders nothing; registration failures are contained and never affect gameplay.
 */
export function WebMcpRegistration({
  reconciliationKey,
  onStatusChange,
  onFocusComponent,
  onFocusRegion,
  onPinObservation,
  onExperimentResult,
}: {
  reconciliationKey: string;
  onStatusChange: (status: WebMcpStatus) => void;
  onFocusComponent?: (componentId: string) => void;
  onFocusRegion?: (regionId: RegionId) => void;
  onPinObservation?: (observation: PinnedObservation) => void;
  onExperimentResult?: (result: ExperimentResult) => void;
}) {
  const evidenceSource = useWebMcpEvidenceSource();
  const sessionStore = useAgentSessionStore();
  const session = useAgentSessionState();
  const registry = useMemo(() => createDefaultCapabilityRegistry(), []);
  // `reconciliationKey` changes for canonical availability inputs only. The
  // final key is still registry-derived, so a non-affecting edit does not cause
  // browser tools to be registered again.
  const availabilityFingerprint = reconciliationKey;
  const onVisualIntent = useMemo(
    () => createVisualCommandPublisher(sessionStore, { onFocusComponent, onFocusRegion, onPinObservation }),
    [onFocusComponent, onFocusRegion, onPinObservation, sessionStore],
  );
  // These callbacks are presentation/workspace concerns and may change as
  // playback or selection state changes. Registration itself must not restart
  // for every callback identity change, so retain the latest implementations
  // behind stable refs.
  const onVisualIntentRef = useRef(onVisualIntent);
  const onExperimentResultRef = useRef(onExperimentResult);
  const onStatusChangeRef = useRef(onStatusChange);
  onVisualIntentRef.current = onVisualIntent;
  onExperimentResultRef.current = onExperimentResult;
  onStatusChangeRef.current = onStatusChange;
  const generationRef = useRef(0);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const retry = () => setRetryToken((token) => token + 1);
    window.addEventListener("faultline:webmcp-retry", retry);
    return () => window.removeEventListener("faultline:webmcp-retry", retry);
  }, []);

  useEffect(() => {
    if (webMcpFeatureState() === "disabled") {
      onStatusChangeRef.current({
        state: "disabled", readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0,
      });
      emitWebMcpTelemetry({ kind: "registration_state", state: "disabled" });
      return;
    }
    const modelContext = getWebMcpModelContext();
    if (!modelContext) {
      onStatusChangeRef.current({
        state: "unsupported", readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0,
      });
      emitWebMcpTelemetry({ kind: "registration_state", state: "unsupported" });
      return;
    }

    const controller = new AbortController();
    evidenceSource.activate();
    evidenceSource.prewarm();
    const development = process.env.NODE_ENV === "development";
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      if (active && generationRef.current === generation) {
        onStatusChangeRef.current({
          state: "partial", readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0, generation,
        });
      }
    }, WEBMCP_REGISTRATION_DEADLINE_MS);
    onStatusChangeRef.current({
      state: "registering", readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0, generation,
    });
    emitWebMcpTelemetry({ kind: "registration_state", state: "registering" });

    const timing = (event: Parameters<typeof emitWebMcpTelemetry>[0]) => emitWebMcpTelemetry(event);

    void registerAgentWebMcpSurface({
      modelContext,
      registry,
      getContext: () => evidenceSource.getSnapshot(controller.signal),
      signal: controller.signal,
      development,
      timing: (event) => timing(event),
      onVisualIntent: (intent) => onVisualIntentRef.current(intent),
      ...(onExperimentResultRef.current
        ? { onExperimentResult: (result) => onExperimentResultRef.current?.(result) }
        : {}),
    }).then((result) => {
      if (!active || timedOut || generationRef.current !== generation) return;
      window.clearTimeout(timeout);
      const state = result.registeredToolNames.length === 0
        ? "failed"
        : result.failedToolNames.length === 0 && result.registeredToolNames.length === result.resolvedToolNames.length
          ? "ready"
          : "partial";
      onStatusChangeRef.current({
        state,
        readToolCount: result.readToolNames.length,
        visualToolCount: result.visualToolNames.length,
        experimentToolCount: result.experimentToolNames.length,
        failedToolCount: result.failedToolNames.length,
        generation,
      });
      emitWebMcpTelemetry({
        kind: "registration_state", state,
        readToolCount: result.readToolNames.length,
        visualToolCount: result.visualToolNames.length,
        experimentToolCount: result.experimentToolNames.length,
        failedToolCount: result.failedToolNames.length,
      });
    }).catch((error) => {
      window.clearTimeout(timeout);
      if (active && !timedOut && generationRef.current === generation) {
        onStatusChangeRef.current({
          state: "failed", readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0, generation,
        });
        emitWebMcpTelemetry({ kind: "registration_error", errorClass: "registration" });
      }
      const expectedCancellation = error instanceof DOMException && error.name === "AbortError";
      if (process.env.NODE_ENV === "development" && !expectedCancellation) {
        console.error("[WebMCP] surface registration failed.", error);
      }
    });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [availabilityFingerprint, evidenceSource, registry, retryToken]);

  // Focus/help changes are explicit player signals. Prewarm their current
  // revision without changing the registered surface or invoking a tool.
  useEffect(() => {
    if (session.focus.kind !== "none" || session.pendingHelpRequest) evidenceSource.prewarm();
  }, [evidenceSource, session.focus.kind, session.pendingHelpRequest, session.revision]);

  return null;
}
