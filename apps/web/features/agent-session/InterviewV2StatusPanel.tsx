"use client";

import { useState } from "react";
import type { InterviewServiceSnapshot } from "@faultline/agent-capabilities";

import { useAgentContextFactory, useInterviewService } from "./AgentSessionProvider";

function statusLabel(snapshot: InterviewServiceSnapshot, stale: boolean): string {
  if (stale) return "Stale — restart on the current design";
  if (snapshot.state.status === "awaiting_answer") return "Answer requested";
  if (snapshot.state.status === "awaiting_follow_up_or_next") return "Follow-up or next";
  if (snapshot.state.status === "awaiting_design_change") return "Edit the canvas";
  if (snapshot.state.status === "awaiting_simulation_critique") return "Review ready for critique";
  if (snapshot.state.status === "completed") return "Complete";
  if (snapshot.state.status === "abandoned") return "Ended";
  return snapshot.state.status;
}

/** Interview status; coaching only, never official submission. */
export function InterviewV2StatusPanel({
  snapshot,
  currentArchitectureRevision,
}: {
  snapshot: InterviewServiceSnapshot | null;
  currentArchitectureRevision: string;
}) {
  const interviewService = useInterviewService();
  const getAgentContext = useAgentContextFactory();
  const [dismissed, setDismissed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  if (!snapshot || dismissed) return null;

  const stale = snapshot.state.status === "stale" || (snapshot.state.phase !== "simulation" && snapshot.state.architectureRevision !== currentArchitectureRevision);
  const question = snapshot.question;
  const isLive = snapshot.state.phase === "simulation" || question?.kind === "simulation";
  const hasFailureSpotlight = !isLive && Boolean(snapshot.presentationCue) && (question?.componentIds?.length ?? 0) > 0;
  const isComplete = snapshot.state.status === "completed";
  const totalQuestions = snapshot.state.totalQuestions;
  const ordinal = Math.min(snapshot.state.questionOrdinal, totalQuestions);

  const restart = async () => {
    setActionError(null);
    setDismissed(false);
    try {
      await interviewService.restart(getAgentContext().context);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to restart the interview.");
    }
  };
  const clear = async () => {
    setActionError(null);
    try {
      await interviewService.clear?.();
      setDismissed(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to clear the interview.");
    }
  };
  const copyReviewPrompt = async () => {
    try {
      await navigator.clipboard.writeText("Review my redesign.");
      setPromptCopied(true);
    } catch {
      setActionError("Copy is unavailable here. Send the phrase: Review my redesign.");
    }
  };

  return (
    <section className={`interview-status-panel${stale ? " interview-status-panel--stale" : ""}`} aria-label="Design interview v2 status">
      <div className="interview-status-panel__header">
        <span className="interview-status-panel__eyebrow">{isLive ? "Live scenario" : hasFailureSpotlight ? "Failure scenario" : "Design interview"}</span>
        <span className="interview-status-panel__status">{statusLabel(snapshot, stale)}</span>
      </div>
      {!isComplete ? <p className="interview-status-panel__progress">Question {ordinal} of {totalQuestions}</p> : null}
      {isLive && !isComplete ? (
        <div className="interview-status-panel__simulation-note">
          <p>Edit the canvas—your architecture is the answer.</p>
          <p>When ready, send this to ChatGPT:</p>
          <button type="button" className="interview-status-panel__copy-prompt" onClick={() => void copyReviewPrompt()} aria-label="Copy review my redesign prompt">Review my redesign.</button>
          {promptCopied ? <span className="interview-status-panel__copied" role="status">Copied</span> : null}
        </div>
      ) : null}
      {hasFailureSpotlight && !isComplete ? (
        <p className="interview-status-panel__simulation-note">Highlighted component is the modeled failure target. Answer in chat—do not edit the canvas.</p>
      ) : null}
      {question ? <p className="interview-status-panel__question">{question.prompt}</p> : null}
      {snapshot.assessment ? <p className="interview-status-panel__meta">Assess: {snapshot.assessment.requiredTopics.join(" · ")}</p> : null}
      {snapshot.liveReview ? <p className="interview-status-panel__meta">Live review digest ready · coaching only.</p> : null}
      {isComplete ? (
        <div className="interview-status-panel__completion">
          <p className="interview-status-panel__completion-title">Interview complete</p>
          <p className="interview-status-panel__meta">{snapshot.state.answers.length} chat answers recorded</p>
          {snapshot.state.simulationCritique ? (
            <>
              <p className="interview-status-panel__verdict">{snapshot.state.simulationCritique.verdict.replaceAll("_", " ")}</p>
              <p className="interview-status-panel__summary">{snapshot.state.simulationCritique.summary}</p>
            </>
          ) : null}
          <p className="interview-status-panel__meta">Coaching complete · not an official submission.</p>
        </div>
      ) : null}
      {isLive && snapshot.state.status === "awaiting_simulation_critique" ? <p className="interview-status-panel__meta">Review prepared from the current redesign. Awaiting simulator-grounded critique.</p> : null}
      {actionError ? <p className="interview-status-panel__error" role="alert">{actionError}</p> : null}
      <div className="interview-status-panel__actions">
        <button type="button" onClick={() => void restart()}>{isComplete || stale ? "Restart interview" : "Restart"}</button>
        <button type="button" onClick={() => void clear()}>Dismiss and clear</button>
      </div>
    </section>
  );
}
