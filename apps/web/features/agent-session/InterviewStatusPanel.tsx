"use client";

import type { InterviewServiceSnapshot } from "@faultline/agent-capabilities";

function statusLabel(snapshot: InterviewServiceSnapshot, stale: boolean): string {
  if (stale) return "Stale — restart on the current design";
  if (snapshot.state.status === "awaiting_answer") return "Answer requested";
  if (snapshot.state.status === "awaiting_follow_up_or_next") return "Follow-up or next question";
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
  if (!snapshot) return null;
  const stale = snapshot.state.architectureRevision !== currentArchitectureRevision;
  const question = snapshot.question;
  return (
    <section className={`interview-status-panel${stale ? " interview-status-panel--stale" : ""}`} aria-label="Design interview status">
      <div className="interview-status-panel__header">
        <span className="interview-status-panel__eyebrow">Design interview</span>
        <span className="interview-status-panel__status">{statusLabel(snapshot, stale)}</span>
      </div>
      <div className="interview-status-panel__progress">
        Question {Math.min(snapshot.state.questionOrdinal, snapshot.state.totalQuestions)} of {snapshot.state.totalQuestions}
      </div>
      {question ? <p className="interview-status-panel__question">{question.prompt}</p> : null}
      {snapshot.state.answers.length > 0 ? <p className="interview-status-panel__meta">{snapshot.state.answers.length} answer{snapshot.state.answers.length === 1 ? "" : "s"} recorded</p> : null}
      {snapshot.state.followUps.length > 0 ? <p className="interview-status-panel__meta">{snapshot.state.followUps.length} follow-up{snapshot.state.followUps.length === 1 ? "" : "s"}</p> : null}
    </section>
  );
}
