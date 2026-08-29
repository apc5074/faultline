import type { SimulationEvent } from "@faultline/simulator";

export type RunTimelineEvent = { event: SimulationEvent; atMs: number };

function beat(event: SimulationEvent): number {
  switch (event.type) {
    case "simulation_started": return 0;
    case "traffic_routed": return 0.14;
    case "component_load_changed": return 0.32;
    case "component_warning": return 0.48;
    case "component_saturated": return 0.64;
    case "requirement_passed":
    case "requirement_failed": return 0.86;
    case "simulation_finished": return 1;
    default: return 0.72;
  }
}

/** Deterministically maps ordered simulator evidence onto a presentation run. */
export function buildRunTimeline(events: readonly SimulationEvent[], durationMs: number): RunTimelineEvent[] {
  const safeDuration = Math.max(1, durationMs);
  const buckets = new Map<number, number>();
  return events.map((event) => {
    const position = beat(event);
    const index = buckets.get(position) ?? 0;
    buckets.set(position, index + 1);
    // Preserve stable order for events sharing one causal beat.
    return { event, atMs: Math.min(safeDuration, Math.round((position + index * 0.012) * safeDuration)) };
  });
}

/** Opening fraction of a timed run over which presentation load eases in. */
export const RUN_RAMP_FRACTION = 0.15;

/**
 * Eases presentation load (edge weights) in over the opening of a timed run so
 * traffic reads as building on the design rather than snapping to full volume.
 * Pure presentation easing — simulator output is unchanged.
 */
export function runRamp01(elapsedMs: number, durationMs: number): number {
  const rampMs = Math.max(1, durationMs) * RUN_RAMP_FRACTION;
  return Math.min(1, Math.max(0, elapsedMs) / rampMs);
}

type FailureEvidence = { type: string; componentId?: string };

/**
 * First component the simulator reports as over capacity or down. Settled
 * presentation marks this node with a persistent red corner tick; the
 * simulator event order is the source of truth.
 */
export function firstFailingComponentId(events: readonly FailureEvidence[]): string | null {
  for (const event of events) {
    if (
      (event.type === "component_saturated" || event.type === "component_failed") &&
      event.componentId
    ) {
      return event.componentId;
    }
  }
  return null;
}
