"use client";

import type { ExperimentResult } from "@faultline/core";

function metric(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(2);
}

export function ExperimentResultPanel({
  result,
  architectureKey,
  resultArchitectureKey,
  onDismiss,
}: {
  result: ExperimentResult;
  architectureKey: string;
  resultArchitectureKey: string;
  onDismiss: () => void;
}) {
  const stale = architectureKey !== resultArchitectureKey;
  const affected = [...new Set(result.events.flatMap((event) => [
    event.componentId,
    typeof event.data.regionId === "string" ? event.data.regionId : undefined,
    typeof event.data.failedRegion === "string" ? event.data.failedRegion : undefined,
  ].filter((value): value is string => Boolean(value))))];
  return <section className="experiment-result-panel" aria-label="Simulated experiment result">
    <div className="experiment-result-panel__heading">
      <strong>simulated · non-persistent</strong>
      <button type="button" onClick={onDismiss}>dismiss</button>
    </div>
    {stale ? <p className="experiment-result-panel__stale">stale — architecture changed; rerun to compare the new baseline</p> : null}
    <p><strong>{result.type}</strong> · {JSON.stringify(result.parameters)}</p>
    <p>requirements: {result.baseline.allRequirementsPass ? "pass" : "fail"} → {result.outcome.allRequirementsPass ? "pass" : "fail"}</p>
    <p>p95: {metric(result.baseline.p95LatencyMs)} → {metric(result.outcome.p95LatencyMs)} ms · headroom: {metric(result.baseline.headroom)} → {metric(result.outcome.headroom)}</p>
    {affected.length > 0 ? <p>affected: {affected.join(", ")}</p> : null}
    <p>{result.events.length} simulator events · {result.delta.requirements.newlyFailed.length} newly failed requirements</p>
  </section>;
}
