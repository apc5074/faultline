"use client";

import type { Architecture, ExperimentResult } from "@faultline/core";
import { compareGeographicRoutes } from "@/features/world-map/route-comparison";
import { activeChallenge } from "@/features/architecture-canvas/playground-challenge";
import { componentDisplayLabel } from "@/features/architecture-canvas/playground-architecture-utils";

function metric(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(2);
}

const EXPERIMENT_QUESTIONS: Record<ExperimentResult["type"], string> = {
  traffic_multiplier: "Can this design absorb the doubled challenge demand?",
  hot_key: "Can the data path withstand more reads concentrated on one URL?",
  cache_flush: "How much origin pressure appears when this cache is cold?",
  component_failure: "Does traffic remain serviceable when this Service is unavailable?",
  region_failure: "Where does demand go when this region is unavailable?",
};

function formatExperimentParameters(
  architecture: Architecture,
  result: ExperimentResult,
): string {
  const parameters = result.parameters as unknown as Readonly<Record<string, unknown>>;
  if (result.type === "traffic_multiplier" && typeof parameters.multiplier === "number") {
    return `×${parameters.multiplier}`;
  }
  if (result.type === "hot_key" && typeof parameters.hotKeyReadFraction === "number") {
    return `${Math.round(parameters.hotKeyReadFraction * 100)}% hot-key reads`;
  }
  if (
    (result.type === "cache_flush" || result.type === "component_failure") &&
    typeof parameters.componentId === "string"
  ) {
    return componentDisplayLabel(architecture, parameters.componentId);
  }
  if (result.type === "region_failure" && typeof parameters.regionId === "string") {
    return parameters.regionId;
  }
  return result.type;
}

export function ExperimentResultPanel({
  result,
  architecture,
  architectureKey,
  resultArchitectureKey,
  baselineEvents,
  onDismiss,
}: {
  result: ExperimentResult;
  architecture: Architecture;
  architectureKey: string;
  resultArchitectureKey: string;
  baselineEvents?: readonly { type: string; componentId?: string; data: Readonly<Record<string, number | string>> }[];
  onDismiss: () => void;
}) {
  const stale = architectureKey !== resultArchitectureKey;
  const labelFor = (componentId: string) => componentDisplayLabel(architecture, componentId);
  const affected = [...new Set(result.events.flatMap((event) => [
    event.componentId ? labelFor(event.componentId) : undefined,
    typeof event.data.regionId === "string" ? event.data.regionId : undefined,
    typeof event.data.failedRegion === "string" ? event.data.failedRegion : undefined,
  ].filter((value): value is string => Boolean(value))))];
  const coldCaches = result.events
    .filter((event) => event.type === "cache_flushed" && event.componentId)
    .map((event) => event.componentId!);
  const cacheMetrics = result.events.filter(
    (event) =>
      event.type === "component_load_changed" &&
      typeof event.componentId === "string" &&
      typeof event.data.hitRps === "number" &&
      typeof event.data.missRps === "number",
  );
  const failedServices = result.events
    .filter((event) => event.type === "component_failed" && event.componentId)
    .map((event) => event.componentId!);
  const reroutedCount = result.events.filter(
    (event) => event.type === "traffic_routed" && event.connectionId,
  ).length;
  const unmetRps = result.events
    .filter((event) => event.type === "unroutable_demand" && typeof event.data.requestsPerSecond === "number")
    .reduce((sum, event) => sum + (event.data.requestsPerSecond as number), 0);
  const routeChanges = compareGeographicRoutes(baselineEvents, result.events);
  const failedOutcomeRequirements = result.outcome.requirements.filter((requirement) => !requirement.passed);
  const requirementLabel = (id: string) => activeChallenge.requirements.find((requirement) => requirement.id === id)?.label ?? id;
  return <section className="experiment-result-panel" aria-label="Simulated experiment result">
    <div className="experiment-result-panel__heading">
      <strong>simulated · non-persistent</strong>
      <button type="button" onClick={onDismiss}>dismiss</button>
    </div>
    {stale ? <p className="experiment-result-panel__stale">stale — architecture changed; rerun to compare the new baseline</p> : null}
    <p><strong>{result.type}</strong> · {formatExperimentParameters(architecture, result)}</p>
    <p><strong>test question:</strong> {EXPERIMENT_QUESTIONS[result.type]}</p>
    <p>requirements: {result.baseline.allRequirementsPass ? "pass" : "fail"} → {result.outcome.allRequirementsPass ? "pass" : "fail"}</p>
    <p>p95: {metric(result.baseline.p95LatencyMs)} → {metric(result.outcome.p95LatencyMs)} ms · headroom: {metric(result.baseline.headroom)} → {metric(result.outcome.headroom)}</p>
    {failedOutcomeRequirements.length > 0 ? (
      <details className="experiment-result-panel__evidence" open>
        <summary>limiting simulator evidence · {failedOutcomeRequirements.length} failed</summary>
        <ul>
          {failedOutcomeRequirements.map((requirement) => (
            <li key={requirement.id}><strong>{requirementLabel(requirement.id)}</strong> · {requirement.explanation}</li>
          ))}
        </ul>
      </details>
    ) : null}
    {affected.length > 0 ? <p>affected: {affected.join(", ")}</p> : null}
    {coldCaches.map((componentId) => (
      <p key={componentId} className="experiment-result-panel__cold-cache">
        simulated cold cache · {labelFor(componentId)} · this experiment only
      </p>
    ))}
    {failedServices.map((componentId) => (
      <p key={`failed-${componentId}`} className="experiment-result-panel__failure">
        simulated service failed · {labelFor(componentId)} · no automatic repair
      </p>
    ))}
    {reroutedCount > 0 ? (
      <p>authoritative surviving routes: {reroutedCount}</p>
    ) : null}
    {unmetRps > 0 ? (
      <p className="experiment-result-panel__unmet">
        demand lost · {metric(unmetRps)} RPS unroutable · requirements above reflect this simulated outcome
      </p>
    ) : null}
    {routeChanges.length > 0 ? (
      <details className="experiment-result-panel__routes" open>
        <summary>simulated route changes · {routeChanges.length}</summary>
        <ol>
          {routeChanges.slice(0, 6).map((change) => {
            const route = change.outcome ?? change.baseline!;
            const status = change.baseline && !change.outcome ? "removed" : !change.baseline && change.outcome ? "new" : "changed";
            return <li key={change.identity}>{status} · {route.originRegion} → {route.destinationRegion} · {route.kind} · {metric(change.baseline?.rps ?? 0)} → {metric(change.outcome?.rps ?? 0)} RPS{change.baseline?.networkLatencyMs !== change.outcome?.networkLatencyMs ? ` · ${metric(change.baseline?.networkLatencyMs ?? 0)} → ${metric(change.outcome?.networkLatencyMs ?? 0)} ms` : ""}</li>;
          })}
        </ol>
      </details>
    ) : null}
    {cacheMetrics.map((event) => (
      <p key={`cache-${event.componentId}`}>
        {labelFor(event.componentId!)}: {metric(event.data.hitRps as number)} hit RPS · {metric(event.data.missRps as number)} miss RPS · {metric((event.data.downstreamAvoidedRps as number | undefined) ?? 0)} downstream RPS avoided
      </p>
    ))}
    <p>{result.events.length} simulator events · {result.delta.requirements.newlyFailed.length} newly failed requirements</p>
  </section>;
}
