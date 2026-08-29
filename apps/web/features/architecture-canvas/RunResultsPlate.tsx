"use client";

import type { RequirementsEvaluationResult } from "@faultline/simulator";

import { StartOfficialAttempt } from "@/features/official-attempt/StartOfficialAttempt";
import type { RunVerdict } from "@/features/architecture-canvas/run-verdict";

type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;

export function RunResultsPlate({
  result,
  verdict,
  stale,
  officialActive,
  officialCompleted,
  onSubmitOfficial,
  onReviewFirstFailure,
  onRun,
  onDismiss,
}: {
  result: SuccessfulSimulation;
  verdict: RunVerdict;
  stale: boolean;
  officialActive: boolean;
  officialCompleted: boolean;
  onSubmitOfficial: () => void;
  onReviewFirstFailure: () => void;
  onRun: () => void;
  onDismiss: () => void;
}) {
  const { passed, total, allPassed } = verdict;

  return (
    <section className={`run-results-plate${stale ? " run-results-plate--stale" : ""}`} aria-label="Last run results">
      <div className="run-results-plate__heading">
        <p>{stale ? "Design changed — run again" : "Last run"}</p>
        <button type="button" onClick={onDismiss} aria-label="Dismiss last run results">×</button>
      </div>
      <p className={`run-results-plate__verdict tabular${allPassed ? "" : " run-results-plate__verdict--fail"}`}>
        <span aria-hidden>{allPassed ? "✓" : "✕"}</span> {passed} / {total} requirements passed
      </p>
      {stale ? (
        <button type="button" className="run-results-plate__cta" onClick={onRun}>Run</button>
      ) : allPassed ? (
        officialActive ? (
          <button type="button" className="run-results-plate__cta" disabled={officialCompleted} onClick={onSubmitOfficial}>
            {officialCompleted ? "Submitted" : "Submit official"}
          </button>
        ) : (
          <StartOfficialAttempt variant="inline" label="Start official attempt" />
        )
      ) : (
        <button type="button" className="run-results-plate__cta run-results-plate__cta--fail" onClick={onReviewFirstFailure}>
          Review first failure
        </button>
      )}
    </section>
  );
}
