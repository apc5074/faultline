import type {
  CachePlacementEvidence,
  CacheResult,
  HotKeyScenarioResult,
  PostgresCapacityMetrics,
  ServiceCapacityMetrics,
  SimulationEvent,
} from "@faultline/simulator";

import { impactSlotSeed, randomizedImpactSlots } from "../traffic-playback/impact-slots.ts";
import {
  buildComponentVolumeShares,
  mechanismCellsFromShare,
} from "../traffic-playback/volume-share-visuals.ts";

import type { GlyphState } from "./glyph-types";

export type GlyphSimulationResult = {
  services: Readonly<Record<string, ServiceCapacityMetrics>>;
  postgres: Readonly<Record<string, PostgresCapacityMetrics>>;
  caches?: Readonly<Record<string, CacheResult & CachePlacementEvidence>>;
  events?: readonly SimulationEvent[];
  hotKey?: HotKeyScenarioResult;
};

export interface DeriveGlyphStateOptions {
  resultIsStale?: boolean;
  selected?: boolean;
  /** Transient dwell while traffic playback runs (T-16). */
  processing?: boolean;
}

export interface GlyphMechanismValues {
  processingCount?: number;
  readProcessingCount?: number;
  writeProcessingCount?: number;
  passCount?: number;
  processingSlotIndices?: readonly number[];
}

type CapacityBandState = ServiceCapacityMetrics["state"] | PostgresCapacityMetrics["state"];

function capacityBandToGlyphState(state: CapacityBandState): GlyphState {
  return state === "healthy" ? "idle" : state;
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

  if (!simulationResult) {
    return selected ? "selected" : "idle";
  }

  if (resultIsStale) {
    return "stale";
  }

  if (selected) {
    return "selected";
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

/** Meter fill only presents simulator-provided utilization; it creates no new capacity bands. */
function meterCellsFromUtilization(utilization: number, slots: number): number {
  if (!Number.isFinite(utilization)) return slots;
  if (utilization <= 0) return 0;
  return Math.min(slots, Math.ceil(utilization * slots));
}

/** Mechanism fill counts for glyphs — cores, DB bands, cache flicker, etc. */
export function deriveGlyphMechanismValues(
  componentId: string,
  simulationResult: GlyphSimulationResult | null,
  options: { resultIsStale?: boolean; redirectRps?: number } = {},
): GlyphMechanismValues {
  if (!simulationResult || options.resultIsStale) {
    return {};
  }

  const redirectRps = options.redirectRps;
  if (typeof redirectRps === "number" && redirectRps > 0) {
    const shares = buildComponentVolumeShares({
      redirectRps,
      simulation: simulationResult,
    });
    const share = shares.get(componentId);

    const service = simulationResult.services[componentId];
    if (service) {
      return {
        processingCount: mechanismCellsFromShare(
          share?.share01 ?? 0,
          4,
          service.state === "saturated" || service.state === "critical",
        ),
      };
    }

    const postgres = simulationResult.postgres[componentId];
    if (postgres) {
      return {
        processingCount: mechanismCellsFromShare(
          share?.share01 ?? 0,
          4,
          postgres.state === "saturated" || postgres.state === "critical",
        ),
        readProcessingCount: meterCellsFromUtilization(postgres.readUtilization, 4),
        writeProcessingCount: meterCellsFromUtilization(postgres.writeUtilization, 4),
      };
    }

    const cache = simulationResult.caches?.[componentId];
    if (cache) {
      if (cache.mechanismId === "edge_cache") {
        return {
          passCount: mechanismCellsFromShare(share?.share01 ?? 0, 6, cache.saturated),
        };
      }

      const capacity = 16;
      const cells = mechanismCellsFromShare(share?.share01 ?? 0, capacity, cache.saturated);
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

  // Legacy fallback when redirect RPS is unavailable — utilization with one-cell floor.
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
      readProcessingCount: meterCellsFromUtilization(postgres.readUtilization, 4),
      writeProcessingCount: meterCellsFromUtilization(postgres.writeUtilization, 4),
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

function rps(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} RPS`;
}

/** A compact, non-color-only description of the simulator's limiting resource. */
export function glyphPressureLabel(
  componentId: string,
  simulationResult: GlyphSimulationResult | null,
  options: { resultIsStale?: boolean } = {},
): string | undefined {
  if (!simulationResult) return undefined;
  if (options.resultIsStale) return "Stale simulation evidence — run again";

  const service = simulationResult.services[componentId];
  if (service) {
    const regionalLimit = service.regions?.find((region) => region.state !== "healthy");
    if (service.state === "healthy" && service.unmetRps <= 0 && !regionalLimit) return undefined;
    const regional = regionalLimit
      ? ` · ${regionalLimit.regionId} ${regionalLimit.state} (${rps(regionalLimit.incomingRps)} / ${rps(regionalLimit.capacityRps)})`
      : "";
    const unmet = service.unmetRps > 0 ? ` · ${rps(service.unmetRps)} unmet` : "";
    return `${service.state} · ${rps(service.incomingRps)} demand / ${rps(service.capacityRps)} capacity${unmet}${regional}`;
  }

  const postgres = simulationResult.postgres[componentId];
  if (postgres) {
    const shortfalls = [
      postgres.readCapacityShortfallRps > 0 ? `${rps(postgres.readCapacityShortfallRps)} read shortfall` : "",
      postgres.writeCapacityShortfallRps > 0 ? `${rps(postgres.writeCapacityShortfallRps)} write shortfall` : "",
    ].filter(Boolean);
    if (postgres.state === "healthy" && shortfalls.length === 0) return undefined;
    return `${postgres.state} · read ${Math.round(postgres.readUtilization * 100)}% · write ${Math.round(postgres.writeUtilization * 100)}%${shortfalls.length ? ` · ${shortfalls.join(", ")}` : ""}`;
  }

  return undefined;
}

/** Cache and hot-key evidence in one compact, text-first label. */
export function glyphEvidenceLabel(
  componentId: string,
  simulationResult: GlyphSimulationResult | null,
  options: { resultIsStale?: boolean } = {},
): string | undefined {
  const pressure = glyphPressureLabel(componentId, simulationResult, options);
  if (!simulationResult || options.resultIsStale) return pressure;

  const cache = simulationResult.caches?.[componentId];
  const cacheEvidence = cache
    ? `${cache.saturated ? "saturated cache" : "cache"} · ${Math.round(cache.hitRate * 100)}% hit · ${rps(cache.hitRps)} hit / ${rps(cache.missRps)} miss · ${rps(cache.downstreamAvoidedRps)} avoided`
    : undefined;
  const hotKeyHop = simulationResult.hotKey?.active
    ? simulationResult.hotKey.hops.find((hop) => hop.componentId === componentId)
    : undefined;
  const hotKeyEvidence = hotKeyHop?.hotKeyUtilization !== null && hotKeyHop?.hotKeyUtilization !== undefined
    ? `viral hot key · ${Math.round(hotKeyHop.hotKeyUtilization * 100)}% hot-key capacity${hotKeyHop.saturated ? " · saturated" : ""}`
    : undefined;

  return [pressure, cacheEvidence, hotKeyEvidence]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .join(" · ") || undefined;
}

/** Screen-reader summary of capacity pressure when simulation results exist. */
export function glyphStateAriaLabel(
  componentId: string,
  simulationResult: GlyphSimulationResult | null,
  options: DeriveGlyphStateOptions = {},
): string | undefined {
  const state = deriveGlyphState(componentId, simulationResult, options);
  if (state === "stale") return "Simulation results stale — run again";
  if (state === "idle" && !simulationResult) {
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
