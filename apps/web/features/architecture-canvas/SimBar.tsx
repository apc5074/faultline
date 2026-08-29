"use client";

import { useId, useState } from "react";

import type { RequirementsEvaluationResult, SimulationValidationError } from "@faultline/simulator";

import type { PlaybackPhase, PlaybackSpeed } from "@/features/traffic-playback";

import { AgentHelpChips } from "@/features/agent-session/AgentHelpChips";
import { ClearAgentMarksButton } from "@/features/agent-session/ClearAgentMarksButton";
import { isFaultlineAiEnabled } from "@/lib/ai/feature-flag";

type SuccessfulSimulation = Extract<RequirementsEvaluationResult, { valid: true }>;
type SimulationRunState = "idle" | "running" | "complete" | "error";

const SPEEDS: PlaybackSpeed[] = [0.5, 1, 2];

function formatRunTime(milliseconds: number): string {
  return `${(Math.max(0, milliseconds) / 1_000).toFixed(1)}s`;
}

function failedRequirementCount(result: SuccessfulSimulation): number {
  return result.requirements.filter((requirement) => !requirement.passed).length +
    (result.hotKey.active && !result.hotKey.passed ? 1 : 0);
}

function formatCost(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function SimBarStatusPlate({
  runState,
  resultIsStale,
  errors,
  unexpectedError,
  result,
  officialSummary,
  verdictAvailable,
}: {
  runState: SimulationRunState;
  resultIsStale: boolean;
  errors: readonly SimulationValidationError[];
  unexpectedError: string | null;
  result: SuccessfulSimulation | null;
  officialSummary: string | null;
  verdictAvailable: boolean;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  const hasIssues =
    Boolean(unexpectedError) ||
    errors.length > 0 ||
    resultIsStale ||
    Boolean(officialSummary) ||
    (result !== null && verdictAvailable);

  const statusText =
    unexpectedError ??
    (errors.length > 0 ? `${errors.length} validation error${errors.length === 1 ? "" : "s"}` : null) ??
    (resultIsStale ? "Results stale — run again" : null) ??
    (result && verdictAvailable
      ? result.allRequirementsPass
        ? "✓ All requirements passed"
        : `✕ ${failedRequirementCount(result)} failing`
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
        aria-live="polite"
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
          {result && verdictAvailable ? (
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
  playbackPhase: PlaybackPhase;
  playbackSpeed: PlaybackSpeed;
  timelineProgress01?: number;
  timelineDurationMs: number;
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
  selectedComponentId: string | null;
};

export function SimBar({
  playbackRunning,
  playbackPaused,
  playbackPhase,
  playbackSpeed,
  timelineProgress01,
  timelineDurationMs,
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
  selectedComponentId,
}: SimBarProps) {
  const simBusy = (runState === "running" && !playbackRunning) || officialSubmitting;
  const livePlayback = playbackPhase === "playing" && runState === "running";
  const paused = playbackPhase === "paused" && runState === "running";
  // The simulator timeline is complete when settling starts; only the visual
  // packet drain remains. The bar can truthfully land the inline verdict here.
  const verdictAvailable = result !== null && (
    playbackPhase === "settling" ||
    (runState === "complete" && playbackPhase === "settled")
  );
  const transportRetired = playbackPhase === "settling" || verdictAvailable;
  const progress01 = Math.min(1, Math.max(0, timelineProgress01 ?? 0));
  const elapsedMs = timelineDurationMs * progress01;
  const progressVisible = (livePlayback || paused) && timelineDurationMs > 0;

  return (
    <footer className="sim-bar" aria-label="Simulation controls">
      {progressVisible ? (
        <div
          className="sim-bar__progress"
          aria-label={`Run progress: ${formatRunTime(elapsedMs)} of ${formatRunTime(timelineDurationMs)}`}
          aria-valuemin={0}
          aria-valuemax={timelineDurationMs}
          aria-valuenow={Math.round(elapsedMs)}
          role="progressbar"
        >
          <span style={{ transform: `scaleX(${progress01})` }} />
        </div>
      ) : null}
      <div className="sim-bar__cluster sim-bar__cluster--start" aria-hidden="true" />

      <div className="sim-bar__cluster sim-bar__cluster--center">
        <div className="sim-bar__transport" role="group" aria-label="Playback transport">
          {paused ? (
            <>
              <button type="button" className="sim-bar__button" onClick={onStep}>step</button>
              <button type="button" className="sim-bar__button sim-bar__button--joined sim-bar__button--run-active" onClick={onRun}>resume</button>
            </>
          ) : transportRetired ? (
            <button type="button" className="sim-bar__button sim-bar__button--reset-subtle" onClick={onReset}>reset</button>
          ) : (
            <>
              <button
                type="button"
                className={`sim-bar__button sim-bar__button--run${livePlayback ? " sim-bar__button--run-active" : ""}`}
                disabled={officialSubmitting}
                onClick={livePlayback ? onPause : onRun}
              >
                {simBusy ? "running…" : livePlayback ? "pause" : "run"}
              </button>
              <button type="button" className="sim-bar__button sim-bar__button--joined" disabled={simBusy} onClick={onReset}>
                reset
              </button>
            </>
          )}
        </div>

        {progressVisible ? <p className="sim-bar__run-clock tabular">running · {formatRunTime(elapsedMs)} / {formatRunTime(timelineDurationMs)}</p> : null}

        <div className="sim-bar__divider" aria-hidden />

        <div className="sim-bar__speed" role="group" aria-label="Playback speed">
          {SPEEDS.map((speed, index) => (
            <button
              key={speed}
              type="button"
              className={`sim-bar__button sim-bar__button--speed${playbackSpeed === speed ? " sim-bar__button--speed-active" : ""}${index === 0 ? " sim-bar__button--speed-first" : " sim-bar__button--joined"}`}
              disabled={transportRetired}
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
      </div>

      <div className="sim-bar__cluster sim-bar__cluster--end">
        {isFaultlineAiEnabled() ? (
          <>
            <AgentHelpChips selectedComponentId={selectedComponentId} />
            <ClearAgentMarksButton />
          </>
        ) : null}

        <SimBarStatusPlate
          runState={runState}
          resultIsStale={resultIsStale}
          errors={errors}
          unexpectedError={unexpectedError}
          result={result}
          officialSummary={officialSummary}
          verdictAvailable={verdictAvailable}
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
      </div>
    </footer>
  );
}
