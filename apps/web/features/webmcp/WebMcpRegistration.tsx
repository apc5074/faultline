"use client";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { getWebMcpModelContext, registerReadWebMcpSurface } from "@faultline/webmcp";
import { useCallback, useEffect, useMemo } from "react";

import { useAgentContextFactory } from "@/features/agent-session/AgentSessionProvider";
import { agentContextFromSnapshot } from "@/lib/agent-context/create-agent-context";

/**
 * Registers the resolver-selected read-only WebMCP surface when the browser supports it.
 * Renders nothing; registration failures are contained and never affect gameplay.
 */
export function WebMcpRegistration({ reconciliationKey }: { reconciliationKey: string }) {
  const getSnapshot = useAgentContextFactory();
  const getContext = useCallback(() => agentContextFromSnapshot(getSnapshot()), [getSnapshot]);
  const registry = useMemo(() => createDefaultCapabilityRegistry(), []);

  useEffect(() => {
    const modelContext = getWebMcpModelContext();
    if (!modelContext) return;

    const controller = new AbortController();

    void registerReadWebMcpSurface({
      modelContext,
      registry,
      getContext,
      signal: controller.signal,
      development: process.env.NODE_ENV === "development",
    }).catch((error) => {
      if (process.env.NODE_ENV === "development") {
        console.error("[WebMCP] Phase 6 surface registration failed.", error);
      }
    });

    return () => {
      controller.abort();
    };
  }, [reconciliationKey, getContext, registry]);

  return null;
}
