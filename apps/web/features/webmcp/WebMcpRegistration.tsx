"use client";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import type { PresentationCue } from "@faultline/agent-capabilities";
import { getWebMcpModelContext, registerAgentWebMcpSurface, WEBMCP_REGISTRATION_DEADLINE_MS, type WebMcpRegistrationGroup, type WebMcpTraceEvent } from "@faultline/webmcp";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type GroupStatus = Pick<WebMcpStatus, "state" | "readToolCount" | "visualToolCount" | "experimentToolCount" | "failedToolCount"> & { generation: number };

function groupStatusFingerprint(status: GroupStatus): string {
  return JSON.stringify([
    status.state,
    status.readToolCount,
    status.visualToolCount,
    status.experimentToolCount,
    status.failedToolCount,
    status.generation,
  ]);
}

function useWebMcpGroupRegistration({
  group,
  reconciliationKey,
  evidenceSource,
  registry,
  retryToken,
  onVisualIntent,
  onExperimentResult,
  onPresentationCue,
  onStatus,
}: {
  group: WebMcpRegistrationGroup;
  reconciliationKey: string;
  evidenceSource: ReturnType<typeof useWebMcpEvidenceSource>;
  registry: ReturnType<typeof createDefaultCapabilityRegistry>;
  retryToken: number;
  onVisualIntent?: (intent: Parameters<ReturnType<typeof createVisualCommandPublisher>>[0]) => void;
  onExperimentResult?: (result: ExperimentResult) => void;
  onPresentationCue?: (cue: PresentationCue) => void;
  onStatus: (group: WebMcpRegistrationGroup, status: GroupStatus) => void;
}) {
  const generationRef = useRef(0);
  const visualRef = useRef(onVisualIntent);
  const experimentRef = useRef(onExperimentResult);
  const presentationRef = useRef(onPresentationCue);
  const statusRef = useRef(onStatus);
  visualRef.current = onVisualIntent;
  experimentRef.current = onExperimentResult;
  presentationRef.current = onPresentationCue;
  statusRef.current = onStatus;

  useEffect(() => {
    if (webMcpFeatureState() === "disabled") {
      statusRef.current(group, { state: "disabled", readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0, generation: 0 });
      return;
    }
    const modelContext = getWebMcpModelContext();
    if (!modelContext) {
      statusRef.current(group, { state: "unsupported", readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0, generation: 0 });
      return;
    }
    const controller = new AbortController();
    evidenceSource.activate();
    evidenceSource.prewarm();
    const generation = ++generationRef.current;
    let active = true;
    const empty = { readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0 };
    const timeout = window.setTimeout(() => {
      if (active && generationRef.current === generation) statusRef.current(group, { state: "partial", ...empty, generation });
    }, WEBMCP_REGISTRATION_DEADLINE_MS);
    statusRef.current(group, { state: "registering", ...empty, generation });
    const timing = (event: Parameters<typeof emitWebMcpTelemetry>[0]) => emitWebMcpTelemetry(event);
    const trace = process.env.NODE_ENV === "production" ? undefined : (event: WebMcpTraceEvent) => emitWebMcpTelemetry({ kind: "trace", traceName: event.name, capability: event.capability, group: event.group, inputShape: event.inputShape, evidenceRevision: event.evidenceRevision, targetCount: event.targetCount, reason: event.reason });
    void registerAgentWebMcpSurface({
      modelContext, registry, getContext: (signal) => evidenceSource.getSnapshot(signal),
      getCurrentEvidenceRevision: () => evidenceSource.getEvidenceRevision(), signal: controller.signal,
      development: process.env.NODE_ENV === "development", group, timing, trace,
      onVisualIntent: (intent) => visualRef.current?.(intent),
      ...(experimentRef.current ? { onExperimentResult: (result: ExperimentResult) => experimentRef.current?.(result) } : {}),
      onPresentationCue: (cue) => {
        presentationRef.current?.(cue);
        if (process.env.NODE_ENV !== "production") emitWebMcpTelemetry({ kind: "trace", traceName: "cue_applied", cueKind: cue.kind, targetCount: cue.targets.length, evidenceRevision: cue.targets[0]?.evidenceRevision });
      },
    }).then((result) => {
      if (!active || generationRef.current !== generation) return;
      window.clearTimeout(timeout);
      const state = result.resolvedToolNames.length === 0
        ? "ready"
        : result.failedToolNames.length === 0 && result.registeredToolNames.length === result.resolvedToolNames.length
          ? "ready"
          : result.registeredToolNames.length === 0
            ? "failed"
            : "partial";
      statusRef.current(group, { state, readToolCount: result.readToolNames.length, visualToolCount: result.visualToolNames.length, experimentToolCount: result.experimentToolNames.length, failedToolCount: result.failedToolNames.length, generation });
    }).catch((error) => {
      window.clearTimeout(timeout);
      if (active && generationRef.current === generation) statusRef.current(group, { state: "failed", ...empty, generation });
      if (process.env.NODE_ENV === "development" && !(error instanceof DOMException && error.name === "AbortError")) console.error("[WebMCP] group registration failed.", error);
    });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [evidenceSource, group, reconciliationKey, registry, retryToken]);
}

/**
 * Registers resolver-selected read and visual WebMCP surfaces when the browser supports it.
 * Renders nothing; registration failures are contained and never affect gameplay.
 */
export function WebMcpRegistration({
  reconciliationKey,
  onStatusChange,
  onFocusComponent,
  onFocusConnection,
  onFocusRegion,
  onPinObservation,
  onExperimentResult,
  onPresentationCue,
}: {
  reconciliationKey: string;
  onStatusChange: (status: WebMcpStatus) => void;
  onFocusComponent?: (componentId: string) => void;
  onFocusConnection?: (connectionId: string) => void;
  onFocusRegion?: (regionId: RegionId) => void;
  onPinObservation?: (observation: PinnedObservation) => void;
  onExperimentResult?: (result: ExperimentResult) => void;
  onPresentationCue?: (cue: PresentationCue) => void;
}) {
  const evidenceSource = useWebMcpEvidenceSource();
  const sessionStore = useAgentSessionStore();
  const session = useAgentSessionState();
  const registry = useMemo(() => createDefaultCapabilityRegistry(), []);
  const onVisualIntent = useMemo(
    () => createVisualCommandPublisher(sessionStore, { onFocusComponent, onFocusConnection, onFocusRegion, onPinObservation }),
    [onFocusComponent, onFocusConnection, onFocusRegion, onPinObservation, sessionStore],
  );
  // These callbacks are presentation/workspace concerns and may change as
  // playback or selection state changes. Registration itself must not restart
  // for every callback identity change, so retain the latest implementations
  // behind stable refs.
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const [retryToken, setRetryToken] = useState(0);
  const [groupStatuses, setGroupStatuses] = useState<Record<string, GroupStatus>>({});
  const onGroupStatus = useCallback((group: WebMcpRegistrationGroup, status: GroupStatus) => {
    setGroupStatuses((current) => {
      if (current[group] && groupStatusFingerprint(current[group]) === groupStatusFingerprint(status)) return current;
      return { ...current, [group]: status };
    });
  }, []);
  const publishedStatusRef = useRef<WebMcpStatus | null>(null);

  useEffect(() => {
    const retry = () => setRetryToken((token) => token + 1);
    window.addEventListener("faultline:webmcp-retry", retry);
    return () => window.removeEventListener("faultline:webmcp-retry", retry);
  }, []);

  const stableKey = reconciliationKey.split(":", 1)[0] ?? reconciliationKey;
  useWebMcpGroupRegistration({ group: "stable-review", reconciliationKey: stableKey, evidenceSource, registry, retryToken, onPresentationCue, onStatus: onGroupStatus });
  useWebMcpGroupRegistration({ group: "stable-visual", reconciliationKey: stableKey, evidenceSource, registry, retryToken, onVisualIntent, onPresentationCue, onStatus: onGroupStatus });
  useWebMcpGroupRegistration({ group: "specialists", reconciliationKey, evidenceSource, registry, retryToken, onPresentationCue, onStatus: onGroupStatus });
  useWebMcpGroupRegistration({ group: "experiments", reconciliationKey, evidenceSource, registry, retryToken, onExperimentResult, onPresentationCue, onStatus: onGroupStatus });

  useEffect(() => {
    const statuses = Object.values(groupStatuses);
    if (statuses.length === 0) return;
    const counts = statuses.reduce((total, status) => ({
      readToolCount: total.readToolCount + status.readToolCount,
      visualToolCount: total.visualToolCount + status.visualToolCount,
      experimentToolCount: total.experimentToolCount + status.experimentToolCount,
      failedToolCount: total.failedToolCount + status.failedToolCount,
    }), { readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0 });
    const state: WebMcpStatus["state"] = statuses.some((status) => status.state === "failed") ? "partial" : statuses.every((status) => status.state === "ready") ? "ready" : statuses.some((status) => status.state === "registering") ? "registering" : "partial";
    const nextStatus = { ...counts, state, generation: Math.max(...statuses.map((status) => status.generation)) };
    const previousStatus = publishedStatusRef.current;
    if (
      previousStatus &&
      previousStatus.state === nextStatus.state &&
      previousStatus.readToolCount === nextStatus.readToolCount &&
      previousStatus.visualToolCount === nextStatus.visualToolCount &&
      previousStatus.experimentToolCount === nextStatus.experimentToolCount &&
      previousStatus.failedToolCount === nextStatus.failedToolCount &&
      previousStatus.generation === nextStatus.generation
    ) return;
    publishedStatusRef.current = nextStatus;
    onStatusChangeRef.current(nextStatus);
  }, [groupStatuses]);

  // Focus/help changes are explicit player signals. Prewarm their current
  // revision without changing the registered surface or invoking a tool.
  useEffect(() => {
    if (session.focus.kind !== "none" || session.pendingHelpRequest) evidenceSource.prewarm();
  }, [evidenceSource, session.focus.kind, session.pendingHelpRequest, session.revision]);

  return null;
}
