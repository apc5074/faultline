"use client";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
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
  onVisualIntentRef.current = onVisualIntent;
  onExperimentResultRef.current = onExperimentResult;

  useEffect(() => {
    const modelContext = getWebMcpModelContext();
    if (!modelContext) {
      onStatusChange({ state: "unsupported", readToolCount: 0, visualToolCount: 0 });
      return;
    }

    const controller = new AbortController();
    const development = process.env.NODE_ENV === "development";
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      onStatusChange({ state: "partial", readToolCount: 0, visualToolCount: 0 });
    }, 8_000);
    onStatusChange({ state: "registering", readToolCount: 0, visualToolCount: 0 });

    void registerAgentWebMcpSurface({
      modelContext,
      registry,
      getContext,
      signal: controller.signal,
      development,
      onVisualIntent: onVisualIntentRef.current,
      ...(onExperimentResultRef.current ? { onExperimentResult: onExperimentResultRef.current } : {}),
    }).then((result) => {
      if (!active || timedOut) return;
      window.clearTimeout(timeout);
      const state = result.readToolNames.length >= 9 && result.visualToolNames.length >= 4 ? "ready" : "partial";
      onStatusChange({
        state,
        readToolCount: result.readToolNames.length,
        visualToolCount: result.visualToolNames.length,
      });
    }).catch((error) => {
      window.clearTimeout(timeout);
      if (active && !timedOut) onStatusChange({ state: "partial", readToolCount: 0, visualToolCount: 0 });
      if (process.env.NODE_ENV === "development") {
        console.error("[WebMCP] surface registration failed.", error);
      }
    });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [reconciliationKey, getContext, registry, onStatusChange]);

  return null;
}
