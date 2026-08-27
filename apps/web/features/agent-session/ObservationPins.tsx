"use client";

import type { PinnedObservation } from "@faultline/agent-capabilities";

export function ObservationPins({ observations, stale, onClear }: { observations: readonly PinnedObservation[]; stale: boolean; onClear: () => void }) {
  if (observations.length === 0) return null;
  return <section className="observation-pins" aria-label="Pinned simulator observations">
    <div><strong>pinned observations</strong><button type="button" onClick={onClear}>clear</button></div>
    {observations.map((observation) => <p key={`${observation.target}:${observation.id}:${observation.metricId}`}>
      {stale ? "stale · " : ""}{observation.label}: <strong>{String(observation.value)}</strong> {observation.unit} · {observation.source}
    </p>)}
  </section>;
}
