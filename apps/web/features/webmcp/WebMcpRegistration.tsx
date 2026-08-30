"use client";

import { capabilitySurfaceFingerprint, createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { getWebMcpModelContext, registerAgentWebMcpSurface } from "@faultline/webmcp";
import { useEffect, useMemo, useRef } from "react";

import {
  useAgentContextFactory,
  useAgentSessionStore,
} from "@/features/agent-session/AgentSessionProvider";
import { createVisualCommandPublisher } from "@/features/agent-session/visual-intent-bridge";
import type { ExperimentResult, RegionId } from "@faultline/core";
import type { PinnedObservation } from "@faultline/agent-capabilities";
import type { WebMcpStatus } from "./WebMcpStatusPlate";

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
  const getContext = useAgentContextFactory();
  const sessionStore = useAgentSessionStore();
  const registry = useMemo(() => createDefaultCapabilityRegistry(), []);
  // `reconciliationKey` changes for canonical availability inputs only. The
  // final key is still registry-derived, so a non-affecting edit does not cause
  // browser tools to be registered again.
  const availabilityFingerprint = useMemo(
    () => capabilitySurfaceFingerprint(registry, getContext().context),
    [getContext, reconciliationKey, registry],
  );
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

  useEffect(() => {
    const modelContext = getWebMcpModelContext();
    if (!modelContext) {
      onStatusChangeRef.current({
        state: "unsupported", readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0,
      });
      return;
    }

    const controller = new AbortController();
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
    }, 8_000);
    onStatusChangeRef.current({
      state: "registering", readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0, generation,
    });

    void registerAgentWebMcpSurface({
      modelContext,
      registry,
      getContext,
      signal: controller.signal,
      development,
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
    }).catch((error) => {
      window.clearTimeout(timeout);
      if (active && !timedOut && generationRef.current === generation) {
        onStatusChangeRef.current({
          state: "failed", readToolCount: 0, visualToolCount: 0, experimentToolCount: 0, failedToolCount: 0, generation,
        });
      }
      if (process.env.NODE_ENV === "development") {
        console.error("[WebMCP] surface registration failed.", error);
      }
    });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [availabilityFingerprint, getContext, registry]);

  return null;
}
