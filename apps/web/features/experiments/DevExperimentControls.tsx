"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ChallengeDefinition, Architecture, ExperimentResult } from "@faultline/core";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateExperiment, type ExperimentEvaluationResult } from "@faultline/simulator";

import {
  DEV_EXPERIMENTS_UI_STORAGE_KEY,
  isDevExperimentHarnessEnabled,
} from "@/lib/experiments/dev-harness-flag";

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

function readUiOpenPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(DEV_EXPERIMENTS_UI_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "1" || stored === "true" || stored === "open";
  } catch {
    return true;
  }
}

function writeUiOpenPreference(open: boolean): void {
  try {
    window.localStorage.setItem(DEV_EXPERIMENTS_UI_STORAGE_KEY, open ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

export function DevExperimentControls({
  architecture,
  challenge,
  onExperimentResult,
}: {
  architecture: Architecture;
  challenge: ChallengeDefinition;
  onExperimentResult?: (result: ExperimentResult) => void;
}) {
  const harnessAllowed = isDevExperimentHarnessEnabled();
  const [panelOpen, setPanelOpen] = useState(true);
  const [choice, setChoice] = useState<ExperimentChoice>("traffic_multiplier");
  const [targetId, setTargetId] = useState("");
  const [result, setResult] = useState<ExperimentEvaluationResult | null>(null);
  const [running, setRunning] = useState(false);
  const runTokenRef = useRef(0);
  const [resultArchitectureKey, setResultArchitectureKey] = useState<string | null>(null);
  const architectureKey = JSON.stringify(architecture);

  useEffect(() => {
    if (!harnessAllowed) return;
    setPanelOpen(readUiOpenPreference());
  }, [harnessAllowed]);

  useEffect(() => () => { runTokenRef.current += 1; }, []);

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

  if (!harnessAllowed) return null;

  const setOpen = (open: boolean) => {
    setPanelOpen(open);
    writeUiOpenPreference(open);
  };

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
      if (nextResult.ok) onExperimentResult?.(nextResult.data);
      setResultArchitectureKey(architectureKey);
      setRunning(false);
    }, 0);
  };

  const cancelExperiment = () => {
    runTokenRef.current += 1;
    setRunning(false);
  };

  return (
    <div className="dev-experiment-controls" data-open={panelOpen ? "true" : "false"}>
      <button
        type="button"
        className="dev-experiment-controls__toggle"
        aria-expanded={panelOpen}
        aria-controls="dev-experiment-panel"
        onClick={() => setOpen(!panelOpen)}
      >
        {panelOpen ? "hide dev" : "dev experiments"}
      </button>
      {panelOpen ? (
        <div id="dev-experiment-panel" className="dev-experiment-controls__panel">
          <div className="dev-experiment-controls__heading">
            <span>dev · simulated only</span>
            {result ? (
              <button type="button" onClick={() => {
                cancelExperiment();
                setResult(null);
                setResultArchitectureKey(null);
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
                  <span>{result.data.events.length} authoritative experiment events</span>
                </>
              ) : (
                <span role="alert">{result.code}: {result.message}</span>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
