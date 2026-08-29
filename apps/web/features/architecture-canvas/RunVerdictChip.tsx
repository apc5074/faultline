"use client";

import type { RunVerdict } from "@/features/architecture-canvas/run-verdict";

export function RunVerdictChip({
  verdict,
  stale,
  onClick,
}: {
  verdict: RunVerdict;
  stale: boolean;
  onClick: () => void;
}) {
  const label = `${verdict.passed} of ${verdict.total} requirements passed${stale ? ", stale" : ""}`;
  return (
    <button
      type="button"
      className={`run-verdict-chip${stale ? " run-verdict-chip--stale" : ""}`}
      aria-label={label}
      onClick={onClick}
    >
      <span className="run-verdict-chip__count tabular">{verdict.passed}/{verdict.total}</span>
      {verdict.allPassed ? <span aria-hidden>✓</span> : <span className="run-verdict-chip__failure-dot" aria-hidden />}
      {stale ? <span className="run-verdict-chip__stale">Stale</span> : null}
    </button>
  );
}
