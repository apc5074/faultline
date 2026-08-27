"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ChallengeDefinition, Architecture } from "@faultline/core";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateExperiment, type ExperimentEvaluationResult } from "@faultline/simulator";

import { isDevExperimentHarnessEnabled } from "@/lib/experiments/dev-harness-flag";
import {
  advancePresentationPlayback,
  cancelPresentationPlayback,
  createPlaybackEvents,
  preparePresentationPlayback,
  settlePresentationPlayback,
  startPresentationPlayback,
  type PlaybackEvent,
  type PresentationPlaybackState,
} from "@/features/traffic-playback";

type ExperimentChoice = "traffic_multiplier" | "hot_key" | "cache_flush" | "component_failure" | "region_failure";

const EXPERIMENT_LABELS: Record<ExperimentChoice, string> = {
  traffic_multiplier: "traffic ×2",
  hot_key: "hot-key 25%",
  cache_flush: "flush cache",
  component_failure: "fail service",
  region_failure: "fail region",
};

function formatMetric(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(2);
}

export function DevExperimentControls({
  architecture,
  challenge,
}: {
  architecture: Architecture;
  challenge: ChallengeDefinition;
}) {
  const [choice, setChoice] = useState<ExperimentChoice>("traffic_multiplier");
  const [targetId, setTargetId] = useState("");
  const [result, setResult] = useState<ExperimentEvaluationResult | null>(null);
  const [playbackEvents, setPlaybackEvents] = useState<readonly PlaybackEvent[]>([]);
  const [running, setRunning] = useState(false);
  const runTokenRef = useRef(0);
  const [resultArchitectureKey, setResultArchitectureKey] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [playbackState, setPlaybackState] = useState<PresentationPlaybackState | null>(null);
  const architectureKey = JSON.stringify(architecture);

  useEffect(() => () => { runTokenRef.current += 1; }, []);

  useEffect(() => {
    if (playbackState?.phase !== "playing") return;
    const timer = window.setTimeout(() => {
      setPlaybackState((current) => {
        if (!current || current.phase !== "playing") return current;
        const advanced = advancePresentationPlayback(current);
        return advanced.nextEventIndex >= advanced.events.length
          ? settlePresentationPlayback(advanced)
          : advanced;
      });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [playbackState]);

  const targets = useMemo(() => {
    switch (choice) {
      case "cache_flush":
        return architecture.components.filter(
          (component) =>
            (component.type === "cdn" || component.type === "redis") &&
            challenge.allowedComponentTypes.includes(component.type),
        );
      case "component_failure":
        return architecture.components.filter(
          (component) => component.type === "service" && challenge.allowedComponentTypes.includes(component.type),
        );
      case "region_failure":
        return [
          ...new Set(
            architecture.components
              .filter((component) => challenge.allowedComponentTypes.includes(component.type))
              .flatMap((component) => component.deployments.map((deployment) => deployment.regionId)),
          ),
        ];
      default:
        return [];
    }
  }, [architecture, choice]);

  const baselineHotKeyFraction = challenge.workload.hotKeyReadFraction ?? 0;
  const hotKeyFraction = Math.min(1, Math.max(0.25, baselineHotKeyFraction + 0.25));
  const targetRequired = choice === "cache_flush" || choice === "component_failure" || choice === "region_failure";
  const targetAvailable = targets.length > 0;
  const unavailableReason = targetRequired && !targetAvailable
    ? choice === "region_failure"
      ? "No deployed regions are available."
      : "No eligible target exists in this architecture."
    : choice === "hot_key" && hotKeyFraction <= baselineHotKeyFraction
      ? "The baseline already uses the maximum hot-key fraction."
      : null;

  if (!isDevExperimentHarnessEnabled()) return null;

  const runExperiment = () => {
    if (unavailableReason || (targetRequired && !targetId)) return;
    const experiment = choice === "traffic_multiplier"
      ? { type: choice, parameters: { multiplier: 2 as const } }
      : choice === "hot_key"
        ? { type: choice, parameters: { hotKeyReadFraction: hotKeyFraction } }
        : choice === "cache_flush"
          ? { type: choice, parameters: { componentId: targetId } }
          : choice === "component_failure"
            ? { type: choice, parameters: { componentId: targetId } }
            : { type: choice, parameters: { regionId: targetId } };

    const token = ++runTokenRef.current;
    setRunning(true);
    window.setTimeout(() => {
      if (token !== runTokenRef.current) return;
      const nextResult = evaluateExperiment({ architecture, challenge, registry: componentRegistry, experiment });
      setResult(nextResult);
      const nextPlaybackEvents = nextResult.ok
        ? createPlaybackEvents({
            runId: `dev-experiment-${choice}-${architectureKey.length}-${targetId || "none"}`,
            source: "experiment",
            events: nextResult.data.events,
          })
        : [];
      setPlaybackEvents(nextPlaybackEvents);
      if (nextPlaybackEvents.length > 0) {
        const prepared = preparePresentationPlayback(nextPlaybackEvents);
        setPlaybackState(reducedMotion ? settlePresentationPlayback(prepared) : startPresentationPlayback(prepared));
      } else {
        setPlaybackState(null);
      }
      setResultArchitectureKey(architectureKey);
      setRunning(false);
    }, 0);
  };

  const cancelExperiment = () => {
    runTokenRef.current += 1;
    setRunning(false);
  };

  return (
    <details className="dev-experiment-controls">
      <summary>dev experiments</summary>
      <div className="dev-experiment-controls__panel">
        <div className="dev-experiment-controls__heading">
          <span>simulated only</span>
          {result ? (
            <button type="button" onClick={() => {
              cancelExperiment();
              setResult(null);
              setResultArchitectureKey(null);
              setPlaybackEvents([]);
              setPlaybackState(null);
            }}>
              dismiss
            </button>
          ) : null}
        </div>
        <div className="dev-experiment-controls__buttons" role="group" aria-label="Development experiments">
          {(Object.keys(EXPERIMENT_LABELS) as ExperimentChoice[]).map((experimentType) => (
            <button
              key={experimentType}
              type="button"
              className={choice === experimentType ? "dev-experiment-controls__button--active" : undefined}
              aria-pressed={choice === experimentType}
              disabled={running}
              onClick={() => {
                setChoice(experimentType);
                setTargetId("");
                setResult(null);
                setResultArchitectureKey(null);
                setPlaybackEvents([]);
                setPlaybackState(null);
              }}
            >
              {EXPERIMENT_LABELS[experimentType]}
            </button>
          ))}
        </div>
        {targetRequired ? (
          <label className="dev-experiment-controls__target">
            target
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">choose…</option>
              {targets.map((target) => {
                const value = typeof target === "string" ? target : target.id;
                const label = typeof target === "string" ? target : `${componentRegistry.get(target.type).label} · ${target.id}`;
                return <option key={value} value={value}>{label}</option>;
              })}
            </select>
          </label>
        ) : null}
        {unavailableReason ? <p className="dev-experiment-controls__note">{unavailableReason}</p> : null}
        <button
          type="button"
          className="dev-experiment-controls__run"
          disabled={running || Boolean(unavailableReason) || (targetRequired && !targetId)}
          onClick={runExperiment}
        >
          {running ? "running…" : `run ${EXPERIMENT_LABELS[choice]}`}
        </button>
        {running ? <button type="button" onClick={cancelExperiment}>cancel</button> : null}
        {playbackEvents.length > 0 ? (
          <div className="dev-experiment-controls__playback" role="group" aria-label="Experiment playback controls">
            <button
              type="button"
              disabled={running}
              onClick={() => {
                const prepared = preparePresentationPlayback(playbackEvents);
                setPlaybackState(reducedMotion ? settlePresentationPlayback(prepared) : startPresentationPlayback(prepared));
              }}
            >
              replay
            </button>
            <button
              type="button"
              onClick={() => setPlaybackState((current) => current ? cancelPresentationPlayback(current) : current)}
            >
              pause / cancel
            </button>
            <label>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => {
                  setReducedMotion(event.target.checked);
                  if (event.target.checked) {
                    setPlaybackState((current) => current ? settlePresentationPlayback(current) : current);
                  }
                }}
              />
              settled
            </label>
            <span>{playbackState?.phase ?? "idle"}</span>
          </div>
        ) : null}
        {result ? (
          <div className="dev-experiment-controls__result" aria-live="polite">
            {resultArchitectureKey !== architectureKey ? <span>stale — architecture changed; rerun</span> : null}
            {result.ok ? (
              <>
                <strong>simulated {result.data.type}</strong>
                <span>
                  {result.data.baseline.allRequirementsPass ? "pass" : "fail"} → {result.data.outcome.allRequirementsPass ? "pass" : "fail"}
                  {" · "}p95 {formatMetric(result.data.baseline.p95LatencyMs)} → {formatMetric(result.data.outcome.p95LatencyMs)} ms
                </span>
                <span>{playbackEvents.length} authoritative experiment events</span>
              </>
            ) : (
              <span role="alert">{result.code}: {result.message}</span>
            )}
          </div>
        ) : null}
      </div>
    </details>
  );
}
