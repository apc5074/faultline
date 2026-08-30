"use client";

import { useEffect, useRef } from "react";

import { useAgentSessionStore, useWebMcpEvidenceSource } from "./AgentSessionProvider";

type SimulationRunState = "idle" | "running" | "complete" | "error";

/**
 * On Run: clear ephemeral focus ticks only; keep notes, paths, and stamps.
 * On Run complete: retain player-run evidence for compare_design_evidence (WMP-018).
 * See docs/WEBMCP.md § Annotation lifecycle.
 */
export function AnnotationRunLifecycle({
  runState,
  runKey,
}: {
  runState: SimulationRunState;
  runKey: string | null;
}) {
  const store = useAgentSessionStore();
  const evidenceSource = useWebMcpEvidenceSource();
  const previousRef = useRef(runState);
  const recordedRunKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = runState;
    if (previous !== "running" && runState === "running") {
      store.clearFocusOnRun();
    }
    if (previous === "running" && runState === "complete" && runKey && recordedRunKeyRef.current !== runKey) {
      recordedRunKeyRef.current = runKey;
      void evidenceSource.recordPlayerRun(runKey).catch(() => undefined);
    }
  }, [runState, runKey, store, evidenceSource]);

  return null;
}
