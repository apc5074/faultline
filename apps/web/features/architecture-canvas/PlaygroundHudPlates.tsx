"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture, ChallengeDefinition, RequirementDefinition, RequirementResult } from "@faultline/core";
import { estimateMonthlyCost } from "@faultline/simulator";

import {
  challengeHotKeyFractionFor,
  challengeHotKeyLabelFor,
  challengeReadWriteRatioLabelFor,
  challengeRedirectRpsFor,
  challengeWriteRpsFor,
  usePlaygroundChallenge,
} from "@/features/architecture-canvas/playground-challenge";
import { componentDisplayLabel, formatCost } from "@/features/architecture-canvas/playground-architecture-utils";
import type { SimulationRunState, SuccessfulSimulation } from "@/features/architecture-canvas/playground-types";

function formatCompactCost(amount: number): string {
  if (amount >= 1_000) {
    const thousands = amount / 1_000;
    const rounded = Math.round(thousands * 10) / 10;
    return `$${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return formatCost(amount);
}

function CostEstimateInfo() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupId = useId();
  const [open, setOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState<CSSProperties>({});

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeSoon = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), 140);
  }, [clearCloseTimer]);

  const positionPopup = useCallback(() => {
    const button = buttonRef.current;
    const popup = popupRef.current;
    if (!button || !popup) return;

    const margin = 12;
    const gap = 8;
    const buttonRect = button.getBoundingClientRect();
    const popupWidth = Math.min(320, window.innerWidth - margin * 2);
    const popupHeight = popup.offsetHeight;
    const left = Math.max(
      margin,
      Math.min(buttonRect.right - popupWidth, window.innerWidth - popupWidth - margin),
    );
    const belowTop = buttonRect.bottom + gap;
    const top =
      belowTop + popupHeight <= window.innerHeight - margin
        ? belowTop
        : Math.max(margin, buttonRect.top - popupHeight - gap);

    setPopupPosition({ top, left, maxWidth: popupWidth });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    positionPopup();
    const handleViewportChange = () => positionPopup();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, positionPopup]);

  return (
    <span className="hud-plate__estimate-help">
      <button
        ref={buttonRef}
        type="button"
        className="hud-plate__estimate-help-button"
        aria-label="How the pre-run cost estimate is calculated"
        aria-controls={popupId}
        aria-expanded={open}
        onClick={() => {
          clearCloseTimer();
          setOpen((current) => !current);
        }}
        onMouseEnter={() => {
          clearCloseTimer();
          setOpen(true);
        }}
        onMouseLeave={closeSoon}
        onFocus={() => {
          clearCloseTimer();
          setOpen(true);
        }}
        onBlur={closeSoon}
      >
        ?
      </button>
      {open ? (
        <div
          ref={popupRef}
          id={popupId}
          role="tooltip"
          className="hud-plate__estimate-popup"
          style={popupPosition}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={closeSoon}
        >
          <strong>What “Est.” is based on</strong>
          <ul>
            <li>Your current components, tiers, replicas, and regions</li>
            <li>Base monthly infrastructure pricing</li>
            <li>No realized traffic or CDN usage yet</li>
            <li>No workload pressure or cross-region transfer charges</li>
          </ul>
          <p>Run the simulation to replace this with the authoritative monthly cost.</p>
        </div>
      ) : null}
    </span>
  );
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
  const { challenge: activeChallenge } = usePlaygroundChallenge();
  const challengeRedirectRps = challengeRedirectRpsFor(activeChallenge);
  const cost = estimateMonthlyCost({
    architecture,
    registry: componentRegistry,
    traffic,
    geographicRoutes,
    challenge: activeChallenge,
  });
  const budget = activeChallenge.monthlyBudget;
  const hasSimulatedCost = traffic !== undefined || geographicRoutes !== undefined;
  const overBudget = cost.monthlyTotal > budget;
  const breakdown = [...cost.lineItems].sort((left, right) => right.amount - left.amount);

  const lineItemLabel = (componentId: string, fallback?: string) => {
    if (fallback) return fallback;
    const component = architecture.components.find((candidate) => candidate.id === componentId);
    return component ? componentDisplayLabel(architecture, componentId) : "Infrastructure";
  };

  return (
    <aside
      className="hud-plate hud-plate--budget"
      aria-label={`Infrastructure budget${hasSimulatedCost ? " based on simulation" : " estimate"}`}
    >
      <div className="hud-plate__title-row">
        <p className="hud-plate__title">Budget</p>
        {!hasSimulatedCost ? <CostEstimateInfo /> : null}
      </div>
      <p className={`hud-plate__totals tabular${overBudget ? " hud-plate__totals--over" : ""}`}>
        {!hasSimulatedCost ? <span className="hud-plate__estimate-label">Est.</span> : null}
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

function formatRequirementTarget(requirement: RequirementDefinition, challenge: ChallengeDefinition): string {
  if (requirement.type === "throughput") {
    return `${challenge.workload.requestsPerSecond.toLocaleString("en-US")} req/sec`;
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
  const { challenge: activeChallenge } = usePlaygroundChallenge();
  const challengeRedirectRps = challengeRedirectRpsFor(activeChallenge);
  const challengeWriteRps = challengeWriteRpsFor(activeChallenge);
  const challengeHotKeyFraction = challengeHotKeyFractionFor(activeChallenge);
  const channels = activeChallenge.workloadChannels ?? [];
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
          {channels.length > 0
            ? channels.map((channel, index) => (
                <span key={channel.id}>{index > 0 ? " · " : ""}{channel.id.replaceAll("-", " ")} {Math.round(channel.ratePerSecond).toLocaleString("en-US")}/sec ({channel.kind.replaceAll("_", " ")})</span>
              ))
            : <>{Math.round(challengeRedirectRps).toLocaleString("en-US")} redirects/sec ·{" "}
              {Math.round(challengeWriteRps).toLocaleString("en-US")} writes/sec · {challengeReadWriteRatioLabelFor(activeChallenge)} ·{" "}
              {challengeHotKeyLabelFor(activeChallenge)}</>}
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
          const target = formatRequirementTarget(requirement, activeChallenge);

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
        {channels.length === 0 && (activeChallenge.workload.hotKeyReadFraction ?? 0) > 0 ? (
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
