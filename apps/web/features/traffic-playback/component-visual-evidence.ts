import { componentRegistry } from "@faultline/component-catalog";
import type { ComponentInstance } from "@faultline/core";

import {
  deriveGlyphState,
  glyphEvidenceLabel,
  type GlyphSimulationResult,
} from "../playground-glyphs/state.ts";
import { glyphPropsFromComponent } from "../playground-glyphs/catalog-map.ts";

import { randomizedImpactSlots } from "./impact-slots.ts";
import { mechanismCellsFromShare, buildComponentVolumeShares } from "./volume-share-visuals.ts";

export type ComponentVisualEvidence = {
  componentId: string;
  state: "idle" | "processing" | "warning" | "critical" | "saturated" | "overloaded" | "failed" | "stale";
  processingCount: number;
  readProcessingCount?: number;
  writeProcessingCount?: number;
  passCount?: number;
  utilization?: number;
  capacityRps?: number;
  incomingRps?: number;
  handledRps?: number;
  unmetRps?: number;
  readRps?: number;
  writeRps?: number;
  readUtilization?: number;
  writeUtilization?: number;
  hitRps?: number;
  missRps?: number;
  hitRate?: number;
  downstreamAvoidedRps?: number;
  queueDepth?: number;
  slotCount?: number;
  objectMarks?: number;
  processingSlotIndices?: readonly number[];
  impactSeed?: string;
  evidenceLabel?: string;
};

export type ComponentVisualEvidenceInput = {
  component: ComponentInstance;
  simulation: GlyphSimulationResult | null;
  redirectRps: number;
  resultIsStale?: boolean;
  /** Ordered playback progress may reveal a bounded portion of a settled path fill. */
  progress?: number;
  impactSeed?: string;
};

function playbackState(state: ReturnType<typeof deriveGlyphState>): ComponentVisualEvidence["state"] {
  return state === "selected" ? "idle" : state;
}

/**
 * Web-only result/evidence selector. It reads simulator output but never runs
 * the simulator or creates a capacity/routing fact. Family branches are local
 * adapters, so a new glyph family adds one focused adapter instead of a global
 * component-type switch.
 */
export function selectComponentVisualEvidence(input: ComponentVisualEvidenceInput): ComponentVisualEvidence {
  const { component, simulation, redirectRps, resultIsStale = false, progress = 1, impactSeed } = input;
  const base: ComponentVisualEvidence = {
    componentId: component.id,
    state: playbackState(deriveGlyphState(component.id, simulation, { resultIsStale })),
    processingCount: 0,
    impactSeed,
    evidenceLabel: glyphEvidenceLabel(component.id, simulation, { resultIsStale }),
  };
  if (!simulation || resultIsStale) return base;

  const level2Queue = simulation.level2?.queues[component.id];
  if (level2Queue) {
    return {
      ...base,
      state: level2Queue.utilization >= 1 ? "saturated" : level2Queue.queueDepth > 0 ? "processing" : "idle",
      processingCount: level2Queue.queueDepth > 0 ? 1 : 0,
      queueDepth: level2Queue.queueDepth,
      slotCount: level2Queue.queueCapacity,
      evidenceLabel: `${Math.round(level2Queue.queueDepth)} queued · ${Math.round(level2Queue.oldestJobAgeMs)}ms oldest`,
    };
  }
  const level2Worker = simulation.level2?.workers[component.id];
  if (level2Worker) {
    return {
      ...base,
      state: level2Worker.processingUtilization >= 1 ? "saturated" : level2Worker.processingUtilization > 0 ? "processing" : "idle",
      processingCount: Math.min(4, Math.ceil(level2Worker.processingUtilization * 4)),
      evidenceLabel: `${Math.round(level2Worker.completedWorkPerSecond)} work/s · ${Math.round(level2Worker.processingUtilization * 100)}% utilized`,
    };
  }
  const level2Storage = simulation.level2?.objectStorage[component.id];
  if (level2Storage) {
    const pressure = Math.max(level2Storage.uploadUtilization, level2Storage.originReadUtilization);
    return {
      ...base,
      state: pressure >= 1 ? "saturated" : pressure > 0.7 ? "warning" : "idle",
      processingCount: Math.min(4, Math.ceil(pressure * 4)),
      objectMarks: level2Storage.storedBytes > 0 ? 3 : level2Storage.uploadThroughputBytesPerSecond > 0 ? 1 : 0,
      evidenceLabel: `${Math.round(pressure * 100)}% I/O pressure`,
    };
  }

  const definition = componentRegistry.get(component.type);
  const glyph = glyphPropsFromComponent(component, definition);
  const shares = buildComponentVolumeShares({ redirectRps, simulation });
  const share = shares.get(component.id);

  if (glyph.type === "server") {
    const service = simulation.services[component.id];
    if (!service) return base;
    const bays = glyph.machineSize === "small" ? 1 : glyph.machineSize === "large" ? 5 : 3;
    const saturated = service.state === "saturated" || service.state === "critical";
    const cells = Math.min(bays, Math.ceil(mechanismCellsFromShare(share?.share01 ?? 0, bays, saturated) * progress));
    return {
      ...base,
      state: service.state === "healthy" ? (cells > 0 ? "processing" : "idle") : service.state,
      processingCount: cells,
      incomingRps: service.incomingRps,
      capacityRps: service.capacityRps,
      handledRps: service.handledRps,
      unmetRps: service.unmetRps,
      utilization: service.utilization,
    };
  }

  if (glyph.type === "sql_db") {
    const postgres = simulation.postgres[component.id];
    if (!postgres) return base;
    const bands = glyph.machineSize === "small" ? 3 : glyph.machineSize === "large" ? 5 : 4;
    const readBands = Math.min(bands, Math.ceil(Math.max(0, postgres.readUtilization) * bands));
    const writeBands = Math.min(bands, Math.ceil(Math.max(0, postgres.writeUtilization) * bands));
    return {
      ...base,
      state: postgres.state === "healthy" ? (Math.max(readBands, writeBands) > 0 ? "processing" : "idle") : postgres.state,
      processingCount: Math.max(readBands, writeBands),
      readProcessingCount: readBands,
      writeProcessingCount: writeBands,
      readRps: postgres.readRps,
      writeRps: postgres.writeRps,
      readUtilization: postgres.readUtilization,
      writeUtilization: postgres.writeUtilization,
      capacityRps: postgres.readCapacityRps + postgres.writeCapacityRps,
    };
  }

  const cache = simulation.caches?.[component.id];
  if (!cache) return base;
  if (glyph.type === "cdn") {
    const cells = Math.min(6, Math.ceil(mechanismCellsFromShare(share?.share01 ?? 0, 6, cache.saturated) * progress));
    return {
      ...base,
      state: cache.saturated
        ? "saturated"
        : cache.utilization > 0.9
          ? "warning"
          : cells > 0
            ? "processing"
            : "idle",
      passCount: cells,
      hitRps: cache.hitRps,
      missRps: cache.missRps,
      hitRate: cache.hitRate,
      utilization: cache.utilization,
      capacityRps: cache.capacityRps,
      downstreamAvoidedRps: cache.downstreamAvoidedRps,
    };
  }
  if (glyph.type === "cache") {
    const slotCount = 16;
    const cells = Math.min(
      slotCount,
      Math.ceil(mechanismCellsFromShare(share?.share01 ?? 0, slotCount, cache.saturated) * progress),
    );
    return {
      ...base,
      state: cache.saturated ? "saturated" : cache.utilization > 0.9 ? "warning" : "idle",
      processingCount: cells,
      processingSlotIndices: cells > 0 && impactSeed
        ? randomizedImpactSlots(slotCount, impactSeed).slice(0, cells)
        : undefined,
      hitRps: cache.hitRps,
      missRps: cache.missRps,
      hitRate: cache.hitRate,
      utilization: cache.utilization,
      capacityRps: cache.capacityRps,
      downstreamAvoidedRps: cache.downstreamAvoidedRps,
    };
  }
  return base;
}
