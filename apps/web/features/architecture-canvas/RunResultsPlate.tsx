"use client";

import type { RequirementsEvaluationResult } from "@faultline/simulator";

import { StartOfficialAttempt } from "@/features/official-attempt/StartOfficialAttempt";
import { FirstRunCoachHint } from "@/features/architecture-canvas/FirstRunCoachHint";
import { activeChallenge } from "@/features/architecture-canvas/playground-challenge";
import { formatCost } from "@/features/architecture-canvas/playground-architecture-utils";
import type { RunVerdict } from "@/features/architecture-canvas/run-verdict";

type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;

export function RunResultsPlate({
  result,
  verdict,
  stale,
  officialActive,
  onSubmitOfficial,
  onReviewFirstFailure,
  onRun,
  onDismiss,
}: {
  result: SuccessfulSimulation;
  verdict: RunVerdict;
  stale: boolean;
  officialActive: boolean;
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
      <dl className={`run-results-plate__metrics tabular${stale ? " run-results-plate__metrics--stale" : ""}`}>
        <div><dt>p95</dt><dd>{result.p95LatencyMs.toFixed(1)} ms</dd></div>
        <div><dt>Headroom</dt><dd>{Math.round(result.headroom * 1_000) / 10}%</dd></div>
        <div><dt>Cost</dt><dd>{formatCost(result.cost.monthlyTotal)} / {formatCost(activeChallenge.monthlyBudget)}</dd></div>
      </dl>
      <details className="run-results-plate__details">
        <summary>Requirement evidence</summary>
        <ul>
          {result.requirements.map((requirement) => (
            <li key={requirement.id} className={requirement.passed ? "" : "run-results-plate__requirement--fail"}>
              <span aria-hidden>{requirement.passed ? "✓" : "✕"}</span>{" "}
              {activeChallenge.requirements.find((definition) => definition.id === requirement.id)?.label ?? requirement.id}
            </li>
          ))}
          {result.hotKey.active ? (
            <li className={result.hotKey.passed ? "" : "run-results-plate__requirement--fail"}>
              <span aria-hidden>{result.hotKey.passed ? "✓" : "✕"}</span> Hot-key scenario
            </li>
          ) : null}
        </ul>
      </details>
      {stale ? (
        <button type="button" className="run-results-plate__cta" onClick={onRun}>Run</button>
      ) : allPassed ? (
        officialActive ? (
          <button type="button" className="run-results-plate__cta" onClick={onSubmitOfficial}>Submit official</button>
        ) : (
          <StartOfficialAttempt variant="inline" label="Start official attempt" />
        )
      ) : (
        <button type="button" className="run-results-plate__cta run-results-plate__cta--fail" onClick={onReviewFirstFailure}>
          Review first failure
        </button>
      )}
      <FirstRunCoachHint />
    </section>
  );
}
