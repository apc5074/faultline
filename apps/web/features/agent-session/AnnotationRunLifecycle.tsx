"use client";

import { useEffect, useRef } from "react";

import { useAgentSessionStore } from "./AgentSessionProvider";

type SimulationRunState = "idle" | "running" | "complete" | "error";

/**
 * On Run: clear ephemeral focus ticks only; keep notes, paths, and stamps.
 * See docs/WEBMCP.md § Annotation lifecycle.
 */
export function AnnotationRunLifecycle({ runState }: { runState: SimulationRunState }) {
  const store = useAgentSessionStore();
  const previousRef = useRef(runState);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = runState;
    if (previous !== "running" && runState === "running") {
      store.clearFocusOnRun();
    }
  }, [runState, store]);

  return null;
}
