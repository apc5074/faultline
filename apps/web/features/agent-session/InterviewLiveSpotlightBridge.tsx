"use client";

import { useEffect, useRef } from "react";
import type { PresentationCue } from "@faultline/agent-capabilities";

import { useInterviewSnapshot } from "./AgentSessionProvider";

/** Hold the failure model only while the live-failure question is current; clear as soon as it ends. */
export function InterviewLiveSpotlightBridge({
  onPresentationCue,
  onModeledFailure,
}: {
  onPresentationCue: (cue: PresentationCue) => void;
  onModeledFailure: (componentId: string | null) => void;
}) {
  const snapshot = useInterviewSnapshot();
  const lastCueKey = useRef<string | null>(null);
  const lastFailureId = useRef<string | null>(null);

  useEffect(() => {
    const status = snapshot?.state.status;
    const question = snapshot?.state.currentQuestion;
    const questionId = question?.questionId;
    const cue = snapshot?.presentationCue;
    const onFailureSlot = status !== "completed"
      && status !== "abandoned"
      && status !== "stale"
      && (snapshot?.assessment?.slotId === "live-failure-v2" || cue?.reason === "error-location");
    const targetFromQuestion = question?.componentIds?.[0];
    const targetFromCue = cue?.targets.find((target) => target.kind === "component" && target.emphasis === "primary")?.entityId
      ?? cue?.targets.find((target) => target.kind === "component")?.entityId;
    const failureTarget = onFailureSlot ? (targetFromQuestion ?? targetFromCue ?? null) : null;

    if (!failureTarget || !questionId) {
      // Always clear after Q4 / completion — including marks applied only via WebMCP cues.
      lastFailureId.current = null;
      lastCueKey.current = null;
      onModeledFailure(null);
      return;
    }

    if (lastFailureId.current !== failureTarget) {
      lastFailureId.current = failureTarget;
      onModeledFailure(failureTarget);
    }

    if (!cue) return;
    const key = `${snapshot.state.interviewId}:${questionId}:${cue.targets.map((target) => target.entityId).join(",")}`;
    if (lastCueKey.current === key) return;
    lastCueKey.current = key;
    onPresentationCue(cue);
  }, [onModeledFailure, onPresentationCue, snapshot]);

  return null;
}
