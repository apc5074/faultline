"use client";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import type { InterviewService, PresentationCue } from "@faultline/agent-capabilities";
import { getWebMcpModelContext, registerAgentWebMcpSurface, WEBMCP_REGISTRATION_DEADLINE_MS, type WebMcpRegistrationGroup, type WebMcpTraceEvent, type WebMcpTimingEvent } from "@faultline/webmcp";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  useAgentSessionStore,
  useComponentExplanationBarrier,
  useInterviewService,
  useWebMcpEvidenceSource,
} from "@/features/agent-session/AgentSessionProvider";
import { createVisualCommandPublisher } from "@/features/agent-session/visual-intent-bridge";
import type { RegionId } from "@faultline/core";
import type { PinnedObservation } from "@faultline/agent-capabilities";
import type { WebMcpStatus } from "./WebMcpStatusPlate";
import { emitWebMcpTelemetry, webMcpFeatureState } from "./webmcp-config";

type GroupStatus = Pick<WebMcpStatus, "state" | "readToolCount" | "visualToolCount" | "failedToolCount"> & { generation: number };

function groupStatusFingerprint(status: GroupStatus): string {
  return JSON.stringify([
    status.state,
    status.readToolCount,
    status.visualToolCount,
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
  onPresentationCue,
  onFocusComponent,
  onComponentExplanationPresentation,
  onStatus,
  interviewService,
}: {
  group: WebMcpRegistrationGroup;
  reconciliationKey: string;
  evidenceSource: ReturnType<typeof useWebMcpEvidenceSource>;
  registry: ReturnType<typeof createDefaultCapabilityRegistry>;
  retryToken: number;
  onVisualIntent?: (intent: Parameters<ReturnType<typeof createVisualCommandPublisher>>[0]) => void;
  onPresentationCue?: (cue: PresentationCue) => void;
  onFocusComponent?: (componentId: string) => void;
  onComponentExplanationPresentation?: import("@faultline/webmcp").ComponentExplanationPresentationHandler;
  onStatus: (group: WebMcpRegistrationGroup, status: GroupStatus) => void;
  interviewService?: InterviewService;
}) {
  const generationRef = useRef(0);
  const visualRef = useRef(onVisualIntent);
  const presentationRef = useRef(onPresentationCue);
  const focusComponentRef = useRef(onFocusComponent);
  const componentExplanationRef = useRef(onComponentExplanationPresentation);
  const statusRef = useRef(onStatus);
  visualRef.current = onVisualIntent;
  presentationRef.current = onPresentationCue;
  focusComponentRef.current = onFocusComponent;
  componentExplanationRef.current = onComponentExplanationPresentation;
  statusRef.current = onStatus;

  useEffect(() => {
    if (webMcpFeatureState() === "disabled") {
      statusRef.current(group, { state: "disabled", readToolCount: 0, visualToolCount: 0, failedToolCount: 0, generation: 0 });
      return;
    }
    const modelContext = getWebMcpModelContext();
    if (!modelContext) {
      statusRef.current(group, { state: "unsupported", readToolCount: 0, visualToolCount: 0, failedToolCount: 0, generation: 0 });
      return;
    }
    const controller = new AbortController();
    evidenceSource.activate();
    evidenceSource.prewarm();
    const generation = ++generationRef.current;
    let active = true;
    const empty = { readToolCount: 0, visualToolCount: 0, failedToolCount: 0 };
    const timeout = window.setTimeout(() => {
      if (active && generationRef.current === generation) statusRef.current(group, { state: "partial", ...empty, generation });
    }, WEBMCP_REGISTRATION_DEADLINE_MS);
    statusRef.current(group, { state: "registering", ...empty, generation });
    const timing = (event: WebMcpTimingEvent) => emitWebMcpTelemetry(event);
    const trace = process.env.NODE_ENV === "production" ? undefined : (event: WebMcpTraceEvent) => emitWebMcpTelemetry({ kind: "trace", traceName: event.name, capability: event.capability, group: event.group, generation: event.generation, inputShape: event.inputShape, evidenceRevision: event.evidenceRevision, targetCount: event.targetCount, reason: event.reason, selectorScope: event.selectorScope, matchedCount: event.matchedCount, retried: event.retried, interviewId: event.interviewId, questionId: event.questionId, interviewTransition: event.interviewTransition, evaluationVerdict: event.evaluationVerdict });
    void registerAgentWebMcpSurface({
      modelContext, registry, getContext: (signal) => evidenceSource.getSnapshot(signal),
      getCurrentEvidenceRevision: () => evidenceSource.getEvidenceRevision(), signal: controller.signal,
      development: process.env.NODE_ENV === "development", group, timing, trace,
      onVisualIntent: (intent) => visualRef.current?.(intent),
      onFocusComponent: (componentId) => focusComponentRef.current?.(componentId),
      ...(componentExplanationRef.current ? { onComponentExplanationPresentation: (command, options) => componentExplanationRef.current!(command, options) } : {}),
      ...(interviewService ? { interviewService } : {}),
      traceGeneration: generation,
      onPresentationCue: (cue) => {
        presentationRef.current?.(cue);
        // A component read's normal presentation cue is also a safe camera
        // fallback. This covers hosts that invoke the read but retain an older
        // visual-tool callback while the page is being reconciled.
        if (cue.camera === "frame-primary" || cue.camera === "frame-set" || cue.camera === "frame-path") {
          const primary = cue.targets.find((target) => target.kind === "component" && target.emphasis === "primary");
          const componentId = primary?.kind === "component"
            ? primary.entityId
            : cue.targets.find((target) => target.kind === "component")?.entityId;
          if (componentId) focusComponentRef.current?.(componentId);
        }
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
      statusRef.current(group, { state, readToolCount: result.readToolNames.length, visualToolCount: result.visualToolNames.length, failedToolCount: result.failedToolNames.length, generation });
    }).catch((error) => {
      window.clearTimeout(timeout);
      if (active && generationRef.current === generation) statusRef.current(group, { state: "failed", ...empty, generation });
      if (process.env.NODE_ENV === "development" && !(error instanceof DOMException && error.name === "AbortError")) console.error("[WebMCP] group registration failed.", error);
    });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [evidenceSource, group, reconciliationKey, registry, retryToken, interviewService]);
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
  onPresentationCue,
}: {
  reconciliationKey: string;
  onStatusChange: (status: WebMcpStatus) => void;
  onFocusComponent?: (componentId: string) => void;
  onFocusConnection?: (connectionId: string) => void;
  onFocusRegion?: (regionId: RegionId) => void;
  onPinObservation?: (observation: PinnedObservation) => void;
  onPresentationCue?: (cue: PresentationCue) => void;
}) {
  const evidenceSource = useWebMcpEvidenceSource();
  const sessionStore = useAgentSessionStore();
  const componentExplanationBarrier = useComponentExplanationBarrier();
  const componentExplanationBarrierRef = useRef(componentExplanationBarrier);
  componentExplanationBarrierRef.current = componentExplanationBarrier;
  const registry = useMemo(() => createDefaultCapabilityRegistry(), []);
  const interviewService = useInterviewService();
  const onVisualIntent = useMemo(
    () => createVisualCommandPublisher(sessionStore, {
      onFocusComponent,
      onFocusConnection,
      onFocusRegion,
      onPinObservation,
      onFocusAnnotationCommitted: (annotation, sessionRevision) => {
        componentExplanationBarrierRef.current.acknowledgeFocusRendered(annotation, sessionRevision);
      },
    }),
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
  useWebMcpGroupRegistration({ group: "stable-review", reconciliationKey: stableKey, evidenceSource, registry, retryToken, onVisualIntent, onPresentationCue, onFocusComponent, onComponentExplanationPresentation: componentExplanationBarrier.awaitPresentation, onStatus: onGroupStatus });
  useWebMcpGroupRegistration({ group: "stable-visual", reconciliationKey: stableKey, evidenceSource, registry, retryToken, onVisualIntent, onPresentationCue, onFocusComponent, onStatus: onGroupStatus });
  useWebMcpGroupRegistration({ group: "specialists", reconciliationKey, evidenceSource, registry, retryToken, onVisualIntent, onPresentationCue, onFocusComponent, onStatus: onGroupStatus });
  useWebMcpGroupRegistration({ group: "stable-interview", reconciliationKey, evidenceSource, registry, retryToken, onPresentationCue, onFocusComponent, onStatus: onGroupStatus, interviewService });

  useEffect(() => {
    const statuses = Object.values(groupStatuses);
    if (statuses.length === 0) return;
    const counts = statuses.reduce((total, status) => ({
      readToolCount: total.readToolCount + status.readToolCount,
      visualToolCount: total.visualToolCount + status.visualToolCount,
      failedToolCount: total.failedToolCount + status.failedToolCount,
    }), { readToolCount: 0, visualToolCount: 0, failedToolCount: 0 });
    const state: WebMcpStatus["state"] = statuses.some((status) => status.state === "failed") ? "partial" : statuses.every((status) => status.state === "ready") ? "ready" : statuses.some((status) => status.state === "registering") ? "registering" : "partial";
    const nextStatus = { ...counts, state, generation: Math.max(...statuses.map((status) => status.generation)) };
    const previousStatus = publishedStatusRef.current;
    if (
      previousStatus &&
      previousStatus.state === nextStatus.state &&
      previousStatus.readToolCount === nextStatus.readToolCount &&
      previousStatus.visualToolCount === nextStatus.visualToolCount &&
      previousStatus.failedToolCount === nextStatus.failedToolCount &&
      previousStatus.generation === nextStatus.generation
    ) return;
    publishedStatusRef.current = nextStatus;
    onStatusChangeRef.current(nextStatus);
  }, [groupStatuses]);

  return null;
}
