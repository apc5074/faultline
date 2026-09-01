"use client";

import { useState } from "react";
import type { ArchitectureNormalEvidence, ArchitectureScenarioEvidence } from "@faultline/core";
import type { InterviewServiceSnapshot } from "@faultline/agent-capabilities";

import { useAgentContextFactory, useInterviewService } from "./AgentSessionProvider";

function statusLabel(snapshot: InterviewServiceSnapshot, stale: boolean): string {
  if (stale) return "Stale — restart on the current design";
  if (snapshot.state.status === "awaiting_answer") return "Answer requested";
  if (snapshot.state.status === "awaiting_follow_up_or_next") return "Follow-up or next question";
  if (snapshot.state.status === "awaiting_design_change") return "Redesign the architecture";
  if (snapshot.state.status === "awaiting_simulation_critique") return "Review ready for critique";
  if (snapshot.state.status === "completed") return "Complete";
  if (snapshot.state.status === "abandoned") return "Ended";
  return snapshot.state.status;
}

export function InterviewStatusPanel({
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
  if (!snapshot) return null;
  if (dismissed) return null;
  const stale = snapshot.state.status === "stale" || (snapshot.state.phase !== "simulation" && snapshot.state.architectureRevision !== currentArchitectureRevision);
  const question = snapshot.question;
  const isSimulation = question?.kind === "simulation" || snapshot.state.phase === "simulation";
  const isComplete = snapshot.state.status === "completed";
  const redesignDetected = isSimulation && question?.kind === "simulation"
    && snapshot.state.candidateArchitectureRevision !== question.baselineArchitectureRevision;
  const review = snapshot.simulationReview?.comparison;
  const formatNumber = (value: number, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : "—";
  const evidenceMetric = (evidence: ArchitectureScenarioEvidence | ArchitectureNormalEvidence, key: "p95LatencyMs" | "throughputRatio" | "headroom") => {
    if ("outcome" in evidence) return evidence.outcome.valid ? formatNumber(evidence.outcome[key]) : "Unavailable";
    return evidence.valid ? formatNumber(evidence[key]) : "Unavailable";
  };
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
    <section className={`interview-status-panel${stale ? " interview-status-panel--stale" : ""}`} aria-label="Design interview status">
      <div className="interview-status-panel__header">
        <span className="interview-status-panel__eyebrow">{isSimulation ? "Simulation review" : "Design interview"}</span>
        <span className="interview-status-panel__status">{isSimulation && !isComplete ? (redesignDetected ? "Redesign detected" : "No redesign yet") : statusLabel(snapshot, stale)}</span>
      </div>
      {!isComplete ? <div className="interview-status-panel__progress">
        Question {Math.min(snapshot.state.questionOrdinal, snapshot.state.totalQuestions)} of {snapshot.state.totalQuestions}
      </div> : null}
      {isSimulation ? (
        <div className="interview-status-panel__simulation-note">
          <p>Changed condition: traffic is doubled (2× workload).</p>
          <p>Edit the canvas—your architecture is the answer.</p>
          <p>When ready, send this to ChatGPT:</p>
          <button type="button" className="interview-status-panel__copy-prompt" onClick={() => void copyReviewPrompt()} aria-label="Copy review my redesign prompt">Review my redesign.</button>
          {promptCopied ? <span className="interview-status-panel__copied" role="status">Copied</span> : null}
        </div>
      ) : null}
      {question ? <p className="interview-status-panel__question">{question.prompt}</p> : null}
      {snapshot.state.answers.length > 0 ? <p className="interview-status-panel__meta">{snapshot.state.answers.length} answer{snapshot.state.answers.length === 1 ? "" : "s"} recorded</p> : null}
      {snapshot.state.followUps.length > 0 ? <p className="interview-status-panel__meta">{snapshot.state.followUps.length} follow-up{snapshot.state.followUps.length === 1 ? "" : "s"}</p> : null}
      {isComplete ? (
        <div className="interview-status-panel__completion">
          <p className="interview-status-panel__completion-title">Interview complete</p>
          <p className="interview-status-panel__meta">{snapshot.state.answers.length + (snapshot.state.simulationCritique ? 1 : 0)} questions answered</p>
          {snapshot.state.simulationCritique ? (
            <>
              <p className="interview-status-panel__verdict">{snapshot.state.simulationCritique.verdict.replaceAll("_", " ")}</p>
              <p className="interview-status-panel__summary">{snapshot.state.simulationCritique.summary}</p>
            </>
          ) : null}
          {review ? (
            <div className="interview-status-panel__metrics" aria-label="Simulation metric comparison">
              <span>Scenario metrics</span>
              <span>Latency {evidenceMetric(review.originalScenario, "p95LatencyMs")} → {evidenceMetric(review.candidateScenario, "p95LatencyMs")} ms</span>
              <span>Throughput {evidenceMetric(review.originalScenario, "throughputRatio")} → {evidenceMetric(review.candidateScenario, "throughputRatio")}</span>
              <span>Headroom {evidenceMetric(review.originalScenario, "headroom")} → {evidenceMetric(review.candidateScenario, "headroom")}</span>
              <span>Monthly cost {review.scenarioMetricDelta ? formatNumber(review.scenarioMetricDelta.costMonthlyTotal) : "Unavailable"} delta</span>
            </div>
          ) : null}
          <p className="interview-status-panel__meta">Clear simulated coaching result · not an official submission.</p>
        </div>
      ) : null}
      {isSimulation && snapshot.state.status === "awaiting_simulation_critique" ? <p className="interview-status-panel__meta">Review prepared from the current redesign. Awaiting simulator-grounded critique.</p> : null}
      {actionError ? <p className="interview-status-panel__error" role="alert">{actionError}</p> : null}
      <div className="interview-status-panel__actions">
        <button type="button" onClick={() => void restart()}>{isComplete || stale ? "Restart interview" : "Restart"}</button>
        <button type="button" onClick={() => void clear()}>Dismiss and clear</button>
      </div>
    </section>
  );
}
