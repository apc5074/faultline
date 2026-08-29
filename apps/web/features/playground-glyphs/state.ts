import type {
  CachePlacementEvidence,
  CacheResult,
  HotKeyScenarioResult,
  PostgresCapacityMetrics,
  ServiceCapacityMetrics,
  SimulationEvent,
  Level2SimulationResult,
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
  level2?: Level2SimulationResult;
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
  queueDepth?: number;
  slotCount?: number;
  objectMarks?: number;
}

type CapacityBandState = ServiceCapacityMetrics["state"] | PostgresCapacityMetrics["state"];

/** Collapses simulator capacity bands into the three-state run grammar: warning+critical strain, saturated fails. */
function capacityBandToGlyphState(state: CapacityBandState): GlyphState {
  if (state === "healthy") return "idle";
  if (state === "warning" || state === "critical") return "warning";
  return "saturated";
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

function hasSaturationEvent(componentId: string, events?: readonly SimulationEvent[]): boolean {
  return events?.some(
    (event) => event.componentId === componentId && event.type === "component_saturated",
  ) ?? false;
}

function cacheBandToGlyphState(cache: CacheResult): GlyphState {
  if (cache.saturated) {
    return "saturated";
  }
  if (cache.utilization > 0.9) {
    return "warning";
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

  // Keep capacity saturation visible after the playback replay settles. This
  // is simulator evidence from the completed run, not a transient animation.
  if (hasSaturationEvent(componentId, simulationResult.events)) {
    return "saturated";
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

  const queue = simulationResult.level2?.queues[componentId];
  if (queue) return queue.utilization >= 1 ? "saturated" : queue.utilization > 0 ? "processing" : "idle";
  const worker = simulationResult.level2?.workers[componentId];
  if (worker) return worker.processingUtilization >= 1 ? "saturated" : worker.processingUtilization > 0 ? "processing" : "idle";
  const storage = simulationResult.level2?.objectStorage[componentId];
  if (storage) {
    const pressure = Math.max(storage.uploadUtilization, storage.originReadUtilization);
    return pressure >= 1 ? "saturated" : pressure > 0.7 ? "warning" : "idle";
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

  const queue = simulationResult.level2?.queues[componentId];
  if (queue) {
    return { queueDepth: queue.queueDepth, slotCount: queue.queueCapacity, processingCount: queue.queueDepth > 0 ? 1 : 0 };
  }
  const worker = simulationResult.level2?.workers[componentId];
  if (worker) {
    return { processingCount: meterCellsFromUtilization(worker.processingUtilization, 4) };
  }
  const storage = simulationResult.level2?.objectStorage[componentId];
  if (storage) {
    return { objectMarks: storage.storedBytes > 0 ? 3 : storage.uploadThroughputBytesPerSecond > 0 ? 1 : 0, processingCount: meterCellsFromUtilization(Math.max(storage.uploadUtilization, storage.originReadUtilization), 4) };
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

/** Compact RPS for glance labels — inspector owns full figures. */
function compactRps(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 1000) {
    const thousands = rounded / 1000;
    const formatted = Number.isInteger(thousands)
      ? String(thousands)
      : thousands.toFixed(1).replace(/\.0$/, "");
    return `${formatted}k`;
  }
  return String(rounded);
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function joinGlanceLines(...parts: Array<string | undefined>): string | undefined {
  const lines = parts.flatMap((part) => (part ? part.split("\n") : [])).filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

/** A compact, non-color-only description of the simulator's limiting resource. */
export function glyphPressureLabel(
  componentId: string,
  simulationResult: GlyphSimulationResult | null,
  options: { resultIsStale?: boolean } = {},
): string | undefined {
  if (!simulationResult) return undefined;
  if (options.resultIsStale) return "STALE";
  if (deriveGlyphState(componentId, simulationResult) === "failed") return "FAILED";

  const service = simulationResult.services[componentId];
  if (service) {
    const regionalLimit = service.regions?.find((region) => region.state !== "healthy");
    if (service.state === "healthy" && service.unmetRps <= 0 && !regionalLimit) return undefined;
    if (service.state === "saturated") return service.unmetRps > 0 ? `SATURATED · ${compactRps(service.unmetRps)} unmet` : "SATURATED";
    return service.unmetRps > 0
      ? `${compactRps(service.unmetRps)} unmet`
      : percent(service.utilization);
  }

  const postgres = simulationResult.postgres[componentId];
  if (postgres) {
    const hasShortfall =
      postgres.readCapacityShortfallRps > 0 || postgres.writeCapacityShortfallRps > 0;
    if (postgres.state === "healthy" && !hasShortfall) return undefined;
    if (postgres.state === "saturated") return "SATURATED";
    return joinGlanceLines(`R ${percent(postgres.readUtilization)}`, `W ${percent(postgres.writeUtilization)}`);
  }

  const cache = simulationResult.caches?.[componentId];
  if (cache) {
    if (cache.saturated) return "SATURATED";
    if (cache.utilization > 0.9) return `${percent(cache.utilization)} utilized`;
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
  const cacheEvidence = cache ? `${percent(cache.hitRate)} HIT` : undefined;

  const hotKeyHop = simulationResult.hotKey?.active
    ? simulationResult.hotKey.hops.find((hop) => hop.componentId === componentId)
    : undefined;
  const hotKeyEvidence =
    hotKeyHop?.hotKeyUtilization !== null && hotKeyHop?.hotKeyUtilization !== undefined
      ? `HOT ${percent(hotKeyHop.hotKeyUtilization)}`
      : undefined;

  return joinGlanceLines(pressure, cacheEvidence, hotKeyEvidence);
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

  const queue = simulationResult?.level2?.queues[componentId];
  if (queue) return `${Math.round(queue.queueDepth)} queued · ${Math.round(queue.oldestJobAgeMs)}ms oldest`;
  const worker = simulationResult?.level2?.workers[componentId];
  if (worker) return `${Math.round(worker.completedWorkPerSecond)} work/s · ${Math.round(worker.processingUtilization * 100)}% utilized`;
  const storage = simulationResult?.level2?.objectStorage[componentId];
  if (storage) return `${Math.round(Math.max(storage.uploadUtilization, storage.originReadUtilization) * 100)}% I/O pressure`;

  if (state !== "idle") {
    return state;
  }

  return undefined;
}
