"use client";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { getWebMcpModelContext, registerReadWebMcpSurface, registerVisualWebMcpSurface } from "@faultline/webmcp";
import { useEffect, useMemo } from "react";

import {
  useAgentContextFactory,
  useAgentSessionStore,
} from "@/features/agent-session/AgentSessionProvider";
import { createVisualIntentHandler } from "@/features/agent-session/visual-intent-bridge";

/**
 * Registers resolver-selected read and visual WebMCP surfaces when the browser supports it.
 * Renders nothing; registration failures are contained and never affect gameplay.
 */
export function WebMcpRegistration({ reconciliationKey }: { reconciliationKey: string }) {
  const getContext = useAgentContextFactory();
  const sessionStore = useAgentSessionStore();
  const registry = useMemo(() => createDefaultCapabilityRegistry(), []);
  const onVisualIntent = useMemo(
    () => createVisualIntentHandler(sessionStore, () => getContext().context.architecture),
    [sessionStore, getContext],
  );

  useEffect(() => {
    const modelContext = getWebMcpModelContext();
    if (!modelContext) return;

    const controller = new AbortController();
    const development = process.env.NODE_ENV === "development";

    void Promise.all([
      registerReadWebMcpSurface({
        modelContext,
        registry,
        getContext,
        signal: controller.signal,
        development,
      }),
      registerVisualWebMcpSurface({
        modelContext,
        registry,
        getContext,
        signal: controller.signal,
        development,
        onVisualIntent,
      }),
    ]).catch((error) => {
      if (process.env.NODE_ENV === "development") {
        console.error("[WebMCP] surface registration failed.", error);
      }
    });

    return () => {
      controller.abort();
    };
  }, [reconciliationKey, getContext, registry, onVisualIntent]);

  return null;
}
