"use client";

import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture, RequirementDefinition, RequirementResult } from "@faultline/core";
import { estimateMonthlyCost } from "@faultline/simulator";

import {
  activeChallenge,
  challengeHotKeyFraction,
  challengeHotKeyLabel,
  challengeReadWriteRatioLabel,
  challengeRedirectRps,
  challengeWriteRps,
} from "@/features/architecture-canvas/playground-challenge";
import { formatCost } from "@/features/architecture-canvas/playground-architecture-utils";
import type { SimulationRunState, SuccessfulSimulation } from "@/features/architecture-canvas/playground-types";

function formatCompactCost(amount: number): string {
  if (amount >= 1_000) {
    const thousands = amount / 1_000;
    const rounded = Math.round(thousands * 10) / 10;
    return `$${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return formatCost(amount);
}

export function BudgetHud({
  architecture,
  traffic,
  geographicRoutes,
}: {
  architecture: Architecture;
  traffic?: SuccessfulSimulation["traffic"];
  geographicRoutes?: SuccessfulSimulation["geographicRoutes"];
}) {
  const cost = estimateMonthlyCost({
    architecture,
    registry: componentRegistry,
    traffic,
    geographicRoutes,
    challenge: activeChallenge,
  });
  const budget = activeChallenge.monthlyBudget;
  const overBudget = cost.monthlyTotal > budget;
  const breakdown = [...cost.lineItems].sort((left, right) => right.amount - left.amount);

  const lineItemLabel = (componentId: string, fallback?: string) => {
    if (fallback) return fallback;
    const component = architecture.components.find((candidate) => candidate.id === componentId);
    return component ? componentRegistry.get(component.type).label : componentId;
  };

  return (
    <aside className="hud-plate hud-plate--budget" aria-label="Infrastructure budget">
      <p className="hud-plate__title">Budget</p>
      <p className={`hud-plate__totals tabular${overBudget ? " hud-plate__totals--over" : ""}`}>
        <strong>{formatCompactCost(cost.monthlyTotal)}</strong>
        <span>/ {formatCompactCost(budget)}</span>
      </p>
      {overBudget ? (
        <p className="hud-plate__meta hud-plate__meta--over" role="status">
          OVER BUDGET — editing remains available
        </p>
      ) : null}
      <details className="hud-plate__details">
        <summary className="hud-plate__details-summary">
          <span>Cost breakdown</span>
          <span className="hud-plate__details-chevron" aria-hidden="true">
           ⌄
          </span>
        </summary>
        {breakdown.length > 0 ? (
          <ul className="hud-plate__list hud-plate__cost-list">
            {breakdown.map((lineItem) => (
              <li key={lineItem.componentId} className="hud-plate__row">
                <div className="hud-plate__row-header">
                  <span>{lineItemLabel(lineItem.componentId, lineItem.label)}</span>
                  <span className="hud-plate__metric tabular">{formatCompactCost(lineItem.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hud-plate__empty">No priced components yet.</p>
        )}
      </details>
    </aside>
  );
}

function formatComparator(comparator: RequirementDefinition["comparator"]): string {
  if (comparator === "gte") return ">=";
  if (comparator === "lte") return "<=";
  return "<";
}

function formatRequirementTarget(requirement: RequirementDefinition): string {
  if (requirement.type === "throughput") {
    return `${activeChallenge.workload.requestsPerSecond.toLocaleString("en-US")} req/sec`;
  }
  if (requirement.type === "latency") {
    return `${formatComparator(requirement.comparator)} ${requirement.target}ms`;
  }
  if (requirement.type === "headroom") {
    return `${formatComparator(requirement.comparator)} ${Math.round(requirement.target * 100)}%`;
  }
  return `${formatComparator(requirement.comparator)} ${formatCost(requirement.target)}`;
}

function formatRequirementActual(result: RequirementResult): string {
  if (result.type === "throughput") {
    // Match simulator percent formatting so 0.995 does not round up to a fake "100%".
    return `${Math.round(result.actual * 1000) / 10}% handled`;
  }
  if (result.type === "latency") {
    return `${result.actual.toFixed(1)}ms`;
  }
  if (result.type === "headroom") {
    return `${Math.round(result.actual * 1000) / 10}%`;
  }
  return formatCost(result.actual);
}

export function RequirementsHud({
  result,
  runState,
  resultIsStale,
  reviewKey = 0,
}: {
  result: SuccessfulSimulation | null;
  runState: SimulationRunState;
  resultIsStale: boolean;
  /** Increments when a global failure is sent here from the results plate. */
  reviewKey?: number;
}) {
  const showResults = result !== null && runState === "complete";
  const overallPass = showResults && result.allRequirementsPass;
  const failedCount = showResults
    ? result.requirements.filter((requirement) => !requirement.passed).length +
      (result.hotKey.active && !result.hotKey.passed ? 1 : 0)
    : 0;

  return (
    <aside
      className={`hud-plate hud-plate--requirements${resultIsStale && showResults ? " hud-plate--stale" : ""}${showResults ? " hud-plate--stamp" : ""}${reviewKey > 0 ? " hud-plate--review-focus" : ""}`}
      aria-label="Baseline simulator requirements"
    >
      <p className="hud-plate__title">Requirements</p>
      <p className="hud-plate__meta">{activeChallenge.title}</p>
      {showResults ? (
        <p className="hud-plate__meta">Baseline simulator evidence</p>
      ) : null}
      {resultIsStale && showResults ? (
        <p className="hud-plate__meta hud-plate__meta--over" role="status">
          STALE — architecture changed; run again for current truth
        </p>
      ) : null}

      <details key={reviewKey} className="hud-plate__details" open={reviewKey > 0}>
        <summary className="hud-plate__details-summary">Challenge workload</summary>
        <p className="hud-plate__meta hud-plate__meta--block tabular">
          {Math.round(challengeRedirectRps).toLocaleString("en-US")} redirects/sec ·{" "}
          {Math.round(challengeWriteRps).toLocaleString("en-US")} writes/sec · {challengeReadWriteRatioLabel} ·{" "}
          {challengeHotKeyLabel}
        </p>
      </details>

      <p className="hud-plate__summary tabular" role="status">
        {showResults ? (
          <>
            <span className={overallPass ? "hud-plate__mark" : "hud-plate__mark hud-plate__mark--fail"} aria-hidden>
              {overallPass ? "✓" : "✕"}
            </span>{" "}
            {overallPass
              ? "All requirements pass"
              : `${failedCount} requirement${failedCount === 1 ? "" : "s"} failed`}
          </>
        ) : (
          "Run the system to evaluate"
        )}
      </p>

      <ul className="hud-plate__list">
        {activeChallenge.requirements.map((requirement) => {
          const evaluated = showResults
            ? result.requirements.find((candidate) => candidate.id === requirement.id)
            : undefined;
          const target = formatRequirementTarget(requirement);

          return (
            <li key={requirement.id} className="hud-plate__row">
              <div className="hud-plate__row-header">
                <span>{requirement.label}</span>
                <span
                  className={
                    evaluated?.passed === false
                      ? "hud-plate__mark hud-plate__mark--fail"
                      : "hud-plate__mark"
                  }
                  aria-hidden
                >
                  {evaluated ? (evaluated.passed ? "✓" : "✕") : "–"}
                </span>
              </div>
              <p className="hud-plate__values tabular">
                {evaluated ? `${formatRequirementActual(evaluated)} / ${target}` : target}
              </p>
              {evaluated && !evaluated.passed ? (
                <p className="hud-plate__explanation">{evaluated.explanation}</p>
              ) : null}
            </li>
          );
        })}
        {(activeChallenge.workload.hotKeyReadFraction ?? 0) > 0 ? (
          <li className="hud-plate__row">
            <div className="hud-plate__row-header">
              <span>Hot-key scenario</span>
              <span
                className={
                  showResults && result.hotKey.active && !result.hotKey.passed
                    ? "hud-plate__mark hud-plate__mark--fail"
                    : "hud-plate__mark"
                }
                aria-hidden
              >
                {showResults && result.hotKey.active ? (result.hotKey.passed ? "✓" : "✕") : "–"}
              </span>
            </div>
            {showResults && result.hotKey.active ? (
              <>
                <p className="hud-plate__values tabular">
                  {result.hotKey.viralRedirectRps.toLocaleString("en-US")} viral req/sec ·{" "}
                  {result.hotKey.viralReachingPostgresRps.toLocaleString("en-US")} to Postgres
                </p>
                {!result.hotKey.passed ? (
                  <p className="hud-plate__explanation">{result.hotKey.explanation}</p>
                ) : null}
              </>
            ) : (
              <p className="hud-plate__values tabular">
                {Math.round(challengeHotKeyFraction * 100)}% of redirects on one viral URL
              </p>
            )}
          </li>
        ) : null}
        {process.env.NODE_ENV !== "production"
          ? activeChallenge.unscoredTargets?.map((target) => (
              <li key={target.id} className="hud-plate__row hud-plate__row--deferred">
                <div className="hud-plate__row-header">
                  <span>{target.label}</span>
                  <span className="hud-plate__mark" aria-hidden>
                    …
                  </span>
                </div>
                <p className="hud-plate__values tabular">≥{(target.target * 100).toFixed(2)}% · not scored yet</p>
                <p className="hud-plate__explanation">{target.reason}</p>
              </li>
            ))
          : null}
      </ul>
    </aside>
  );
}
