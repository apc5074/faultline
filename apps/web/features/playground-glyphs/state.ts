import type {
  CachePlacementEvidence,
  CacheResult,
  PostgresCapacityMetrics,
  ServiceCapacityMetrics,
  SimulationEvent,
} from "@faultline/simulator";

import { impactSlotSeed, randomizedImpactSlots } from "../traffic-playback/impact-slots.ts";

import type { GlyphState } from "./glyph-types";

export type GlyphSimulationResult = {
  services: Readonly<Record<string, ServiceCapacityMetrics>>;
  postgres: Readonly<Record<string, PostgresCapacityMetrics>>;
  caches?: Readonly<Record<string, CacheResult & CachePlacementEvidence>>;
  events?: readonly SimulationEvent[];
};

export interface DeriveGlyphStateOptions {
  resultIsStale?: boolean;
  selected?: boolean;
  /** Transient dwell while traffic playback runs (T-16). */
  processing?: boolean;
}

export interface GlyphMechanismValues {
  processingCount?: number;
  passCount?: number;
  processingSlotIndices?: readonly number[];
}

type CapacityBandState = ServiceCapacityMetrics["state"] | PostgresCapacityMetrics["state"];

function capacityBandToGlyphState(state: CapacityBandState): GlyphState {
  if (state === "critical" || state === "saturated") {
    return "overloaded";
  }
  return "idle";
}

function isTruthyEventFlag(value: number | string | undefined): boolean {
  return value === 1 || value === "1" || value === "true";
}

function hasExplicitFailure(componentId: string, events?: readonly SimulationEvent[]): boolean {
  if (!events) return false;
  return events.some(
    (event) =>
      event.componentId === componentId &&
      (isTruthyEventFlag(event.data.failed) || event.data.state === "failed"),
  );
}

function cacheBandToGlyphState(cache: CacheResult): GlyphState {
  if (cache.saturated || cache.utilization > 0.9) {
    return "overloaded";
  }
  return "idle";
}

/** Maps simulator metrics to glyph visual state. Pure — no simulator calls. */
export function deriveGlyphState(
  componentId: string,
  simulationResult: GlyphSimulationResult | null,
  options: DeriveGlyphStateOptions = {},
): GlyphState {
  const { resultIsStale = false, selected = false, processing = false } = options;

  if (selected) {
    return "selected";
  }

  if (!simulationResult || resultIsStale) {
    return "idle";
  }

  if (hasExplicitFailure(componentId, simulationResult.events)) {
    return "failed";
  }

  if (processing) {
    return "processing";
  }

  const service = simulationResult.services[componentId];
  if (service) {
    return capacityBandToGlyphState(service.state);
  }

  const postgres = simulationResult.postgres[componentId];
  if (postgres) {
    return capacityBandToGlyphState(postgres.state);
  }

  const cache = simulationResult.caches?.[componentId];
  if (cache) {
    return cacheBandToGlyphState(cache);
  }

  return "idle";
}

function mechanismCellsFromUtilization(utilization: number, slots: number, saturated: boolean): number {
  if (saturated) return slots;
  if (utilization <= 0) return 0;
  return Math.min(slots, Math.max(1, Math.ceil(utilization * slots)));
}

/** Mechanism fill counts for glyphs — cores, DB bands, cache flicker, etc. */
export function deriveGlyphMechanismValues(
  componentId: string,
  simulationResult: GlyphSimulationResult | null,
  options: { resultIsStale?: boolean } = {},
): GlyphMechanismValues {
  if (!simulationResult || options.resultIsStale) {
    return {};
  }

  const service = simulationResult.services[componentId];
  if (service) {
    return {
      processingCount: mechanismCellsFromUtilization(
        service.utilization,
        4,
        service.state === "saturated",
      ),
    };
  }

  const postgres = simulationResult.postgres[componentId];
  if (postgres) {
    return {
      processingCount: mechanismCellsFromUtilization(
        postgres.effectiveUtilization,
        4,
        postgres.state === "saturated",
      ),
    };
  }

  const cache = simulationResult.caches?.[componentId];
  if (cache) {
    if (cache.mechanismId === "edge_cache") {
      return {
        passCount: cache.hitRps > 0 ? Math.max(1, Math.ceil(cache.hitRate * 6)) : 0,
      };
    }

    const capacity = 16;
    const cells =
      cache.hitRps > 0
        ? Math.min(capacity, mechanismCellsFromUtilization(cache.utilization, capacity, cache.saturated))
        : 0;
    const slotOrder = randomizedImpactSlots(
      capacity,
      impactSlotSeed({ runId: "glyph", componentId, sequence: 0 }),
    );
    return {
      processingCount: cells,
      processingSlotIndices: slotOrder.slice(0, cells),
    };
  }

  return {};
}

/** Screen-reader summary of capacity pressure when simulation results exist. */
export function glyphStateAriaLabel(
  componentId: string,
  simulationResult: GlyphSimulationResult | null,
  options: DeriveGlyphStateOptions = {},
): string | undefined {
  const state = deriveGlyphState(componentId, simulationResult, options);
  if (state === "idle" && (!simulationResult || options.resultIsStale)) {
    return options.resultIsStale ? "Simulation results stale" : undefined;
  }

  const service = simulationResult?.services[componentId];
  if (service) {
    return `${service.state}, ${Math.round(service.utilization * 100)}% utilization`;
  }

  const postgres = simulationResult?.postgres[componentId];
  if (postgres) {
    return `${postgres.state}, ${Math.round(postgres.effectiveUtilization * 100)}% effective utilization`;
  }

  const cache = simulationResult?.caches?.[componentId];
  if (cache) {
    return cache.saturated ? "saturated" : `${Math.round(cache.utilization * 100)}% utilization`;
  }

  if (state !== "idle") {
    return state;
  }

  return undefined;
}
