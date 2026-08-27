"use client";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { getWebMcpModelContext, registerAgentWebMcpSurface } from "@faultline/webmcp";
import { useEffect, useMemo } from "react";

import {
  useAgentContextFactory,
  useAgentSessionStore,
} from "@/features/agent-session/AgentSessionProvider";
import { createVisualCommandPublisher } from "@/features/agent-session/visual-intent-bridge";
import type { ExperimentResult } from "@faultline/core";
import type { WebMcpStatus } from "./WebMcpStatusPlate";

/**
 * Registers resolver-selected read and visual WebMCP surfaces when the browser supports it.
 * Renders nothing; registration failures are contained and never affect gameplay.
 */
export function WebMcpRegistration({
  reconciliationKey,
  onStatusChange,
  onExperimentResult,
}: {
  reconciliationKey: string;
  onStatusChange: (status: WebMcpStatus) => void;
  onExperimentResult?: (result: ExperimentResult) => void;
}) {
  const getContext = useAgentContextFactory();
  const sessionStore = useAgentSessionStore();
  const registry = useMemo(() => createDefaultCapabilityRegistry(), []);
  const onVisualIntent = useMemo(
    () => createVisualCommandPublisher(sessionStore),
    [sessionStore],
  );

  useEffect(() => {
    const modelContext = getWebMcpModelContext();
    if (!modelContext) {
      onStatusChange({ state: "unsupported", readToolCount: 0, visualToolCount: 0 });
      return;
    }

    const controller = new AbortController();
    const development = process.env.NODE_ENV === "development";
    let active = true;
    onStatusChange({ state: "registering", readToolCount: 0, visualToolCount: 0 });

    void registerAgentWebMcpSurface({
      modelContext,
      registry,
      getContext,
      signal: controller.signal,
      development,
      onVisualIntent,
      ...(onExperimentResult ? { onExperimentResult } : {}),
    }).then((result) => {
      if (!active) return;
      const state = result.readToolNames.length >= 9 && result.visualToolNames.length === 4 ? "ready" : "partial";
      onStatusChange({
        state,
        readToolCount: result.readToolNames.length,
        visualToolCount: result.visualToolNames.length,
      });
    }).catch((error) => {
      if (active) onStatusChange({ state: "partial", readToolCount: 0, visualToolCount: 0 });
      if (process.env.NODE_ENV === "development") {
        console.error("[WebMCP] surface registration failed.", error);
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reconciliationKey, getContext, registry, onStatusChange, onVisualIntent]);

  return null;
}
