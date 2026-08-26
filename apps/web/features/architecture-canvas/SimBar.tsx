"use client";

import { useId, useState } from "react";

import type { RequirementsEvaluationResult, SimulationValidationError } from "@faultline/simulator";

import type { PlaybackSpeed } from "@/features/traffic-playback";

type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;
type SimulationRunState = "idle" | "running" | "complete" | "error";

const SPEEDS: PlaybackSpeed[] = [0.5, 1, 2];

function formatCost(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusLabel(
  runState: SimulationRunState,
  resultIsStale: boolean,
  playbackRunning: boolean,
  playbackPaused: boolean,
): string {
  if (runState === "running") return "Evaluating…";
  if (playbackRunning && !playbackPaused) return "Playing";
  if (playbackPaused) return "Paused";
  if (runState === "complete") return resultIsStale ? "Stale" : "Complete";
  if (runState === "error") return resultIsStale ? "Stale" : "Error";
  return "Idle";
}

function SimBarStatusPlate({
  runState,
  resultIsStale,
  errors,
  unexpectedError,
  result,
  officialSummary,
}: {
  runState: SimulationRunState;
  resultIsStale: boolean;
  errors: readonly SimulationValidationError[];
  unexpectedError: string | null;
  result: SuccessfulSimulation | null;
  officialSummary: string | null;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  const hasIssues =
    Boolean(unexpectedError) ||
    errors.length > 0 ||
    resultIsStale ||
    Boolean(officialSummary) ||
    (result !== null && runState === "complete");

  const statusText =
    unexpectedError ??
    (errors.length > 0 ? `${errors.length} validation error${errors.length === 1 ? "" : "s"}` : null) ??
    (resultIsStale ? "Results stale — run again" : null) ??
    (result && runState === "complete"
      ? result.allRequirementsPass
        ? "All requirements passed"
        : "Requirements failed"
      : null) ??
    officialSummary;

  if (!hasIssues && !statusText) return null;

  return (
    <div className="sim-bar__status-plate">
      <button
        type="button"
        className={`sim-bar__status-toggle${open ? " sim-bar__status-toggle--open" : ""}${unexpectedError || errors.length > 0 ? " sim-bar__status-toggle--alert" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {statusText ?? "Status"}
      </button>
      {open ? (
        <div id={panelId} className="sim-bar__status-panel" role="region" aria-label="Simulation status">
          {resultIsStale ? (
            <p className="sim-bar__status-note">Architecture changed since the last run. Run again for current truth.</p>
          ) : null}
          {unexpectedError ? (
            <p className="sim-bar__status-error" role="alert">
              {unexpectedError}
            </p>
          ) : null}
          {errors.length > 0 ? (
            <ul className="sim-bar__status-errors" aria-label="Simulation validation errors">
              {errors.map((error, index) => (
                <li key={`${error.code}-${error.componentId ?? error.connectionId ?? index}`}>{error.message}</li>
              ))}
            </ul>
          ) : null}
          {officialSummary ? <p className="sim-bar__status-note">{officialSummary}</p> : null}
          {result && runState === "complete" ? (
            <dl className={`sim-bar__status-result tabular${resultIsStale ? " sim-bar__status-result--stale" : ""}`}>
              <div>
                <dt>Outcome</dt>
                <dd>{result.allRequirementsPass ? "Pass" : "Fail"}</dd>
              </div>
              <div>
                <dt>p95</dt>
                <dd>{result.p95LatencyMs.toFixed(1)} ms</dd>
              </div>
              <div>
                <dt>Headroom</dt>
                <dd>{Math.round(result.headroom * 1000) / 10}%</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{formatCost(result.cost.monthlyTotal)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type SimBarProps = {
  playbackRunning: boolean;
  playbackPaused: boolean;
  playbackSpeed: PlaybackSpeed;
  runState: SimulationRunState;
  resultIsStale: boolean;
  errors: readonly SimulationValidationError[];
  unexpectedError: string | null;
  result: SuccessfulSimulation | null;
  viewMode: "logical" | "world";
  officialActive: boolean;
  officialSubmitting: boolean;
  officialSummary: string | null;
  onRun: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onViewModeChange: (mode: "logical" | "world") => void;
  onSubmitOfficial: () => void;
};

export function SimBar({
  playbackRunning,
  playbackPaused,
  playbackSpeed,
  runState,
  resultIsStale,
  errors,
  unexpectedError,
  result,
  viewMode,
  officialActive,
  officialSubmitting,
  officialSummary,
  onRun,
  onPause,
  onStep,
  onReset,
  onSpeedChange,
  onViewModeChange,
  onSubmitOfficial,
}: SimBarProps) {
  const simBusy = runState === "running" || officialSubmitting;
  const playbackActive = playbackRunning && !playbackPaused;

  return (
    <footer className="sim-bar" aria-label="Simulation controls">
      <div className="sim-bar__transport" role="group" aria-label="Playback transport">
        <button
          type="button"
          className={`sim-bar__button sim-bar__button--run${playbackActive ? " sim-bar__button--run-active" : ""}`}
          disabled={simBusy}
          onClick={playbackActive ? onPause : onRun}
        >
          {simBusy ? "running…" : playbackActive ? "pause" : "run"}
        </button>
        <button type="button" className="sim-bar__button sim-bar__button--joined" disabled={simBusy} onClick={onStep}>
          step
        </button>
        <button type="button" className="sim-bar__button sim-bar__button--joined" disabled={simBusy} onClick={onReset}>
          reset
        </button>
      </div>

      <div className="sim-bar__divider" aria-hidden />

      <div className="sim-bar__speed" role="group" aria-label="Playback speed">
        {SPEEDS.map((speed, index) => (
          <button
            key={speed}
            type="button"
            className={`sim-bar__button sim-bar__button--speed${playbackSpeed === speed ? " sim-bar__button--speed-active" : ""}${index === 0 ? " sim-bar__button--speed-first" : " sim-bar__button--joined"}`}
            onClick={() => onSpeedChange(speed)}
          >
            {speed}×
          </button>
        ))}
      </div>

      <div className="sim-bar__divider" aria-hidden />

      <div className="sim-bar__view" role="group" aria-label="Architecture view">
        <button
          type="button"
          className={`sim-bar__button sim-bar__button--view${viewMode === "logical" ? " sim-bar__button--view-active" : ""}`}
          aria-pressed={viewMode === "logical"}
          onClick={() => onViewModeChange("logical")}
        >
          architecture
        </button>
        <button
          type="button"
          className={`sim-bar__button sim-bar__button--view sim-bar__button--joined${viewMode === "world" ? " sim-bar__button--view-active" : ""}`}
          aria-pressed={viewMode === "world"}
          onClick={() => onViewModeChange("world")}
        >
          world
        </button>
      </div>

      <p className="sim-bar__state" aria-live="polite">
        {statusLabel(runState, resultIsStale, playbackRunning, playbackPaused)}
      </p>

      <div className="sim-bar__spacer" />

      <SimBarStatusPlate
        runState={runState}
        resultIsStale={resultIsStale}
        errors={errors}
        unexpectedError={unexpectedError}
        result={result}
        officialSummary={officialSummary}
      />

      {officialActive ? (
        <button
          type="button"
          className="sim-bar__button sim-bar__button--official"
          disabled={simBusy}
          onClick={onSubmitOfficial}
        >
          {officialSubmitting ? "submitting…" : "submit official"}
        </button>
      ) : null}
    </footer>
  );
}
