import type { Architecture, ComponentInstance } from "@faultline/core";
import { componentRegistry } from "@faultline/component-catalog";

import type { GlyphSimulationResult } from "../playground-glyphs/state.ts";
import { glyphPropsFromComponent } from "../playground-glyphs/catalog-map.ts";

import { impactSlotSeed, randomizedImpactSlots } from "./impact-slots.ts";
import type { ComponentPlaybackVisual } from "./types";

export interface PlaybackVisualContext {
  runId: string;
  architecture: Architecture;
  components: readonly ComponentInstance[];
  simulation: GlyphSimulationResult;
}

function mechanismCellsFromLoad(load: number, slots: number, saturated: boolean): number {
  if (saturated) return slots;
  if (load <= 0) return 0;
  return Math.min(slots, Math.max(1, Math.ceil(load * slots)));
}

function cacheVisual(
  componentId: string,
  runId: string,
  capacity: number,
  cache: NonNullable<GlyphSimulationResult["caches"]>[string],
  progress: number,
  tick: number,
): Pick<ComponentPlaybackVisual, "processingCount" | "cacheHitFlash" | "processingSlotIndices" | "state"> {
  const slots = Math.max(1, capacity);
  const targetCells = mechanismCellsFromLoad(cache.utilization, slots, cache.saturated);
  const visibleCells = Math.min(slots, Math.max(0, Math.ceil(targetCells * progress)));
  const slotOrder = randomizedImpactSlots(
    slots,
    impactSlotSeed({ runId, componentId, sequence: tick }),
  );

  const flash = progress >= 0.85 && cache.hitRps > 0 && tick % 12 === 0;

  return {
    processingCount: visibleCells,
    processingSlotIndices: slotOrder.slice(0, visibleCells),
    cacheHitFlash: flash,
    state: cache.saturated ? "overloaded" : visibleCells > 0 ? "processing" : "idle",
  };
}

function serverVisual(
  service: NonNullable<GlyphSimulationResult["services"]>[string],
  machineSize: "small" | "medium" | "large",
  progress: number,
): Pick<ComponentPlaybackVisual, "processingCount" | "state"> {
  const maxBays = machineSize === "small" ? 1 : machineSize === "medium" ? 3 : 5;
  const target = mechanismCellsFromLoad(service.utilization, maxBays, service.state === "saturated");
  const visible = Math.min(maxBays, Math.max(0, Math.ceil(target * progress)));
  return {
    processingCount: visible,
    state: service.state === "saturated" || service.state === "critical" ? "overloaded" : visible > 0 ? "processing" : "idle",
  };
}

function storeVisual(
  postgres: NonNullable<GlyphSimulationResult["postgres"]>[string],
  machineSize: "small" | "medium" | "large",
  progress: number,
): Pick<ComponentPlaybackVisual, "processingCount" | "state"> {
  const bands = machineSize === "small" ? 3 : machineSize === "large" ? 5 : 4;
  const target = mechanismCellsFromLoad(postgres.effectiveUtilization, bands, postgres.state === "saturated");
  const visible = Math.min(bands, Math.max(0, Math.ceil(target * progress)));
  return {
    processingCount: visible,
    state: postgres.state === "saturated" || postgres.state === "critical" ? "overloaded" : visible > 0 ? "processing" : "idle",
  };
}

/** Maps authoritative sim metrics to glyph playback visuals; never reads challenge affinity tables directly. */
export function buildComponentPlaybackVisuals(
  context: PlaybackVisualContext,
  visibleEventCount: number,
  totalEvents: number,
): ComponentPlaybackVisual[] {
  const progress = totalEvents > 0 ? Math.min(1, visibleEventCount / totalEvents) : 1;
  const tick = visibleEventCount;

  return context.components.flatMap((component) => {
    const definition = componentRegistry.get(component.type);
    const glyphCatalog = glyphPropsFromComponent(component, definition);
    const cache = context.simulation.caches?.[component.id];
    const service = context.simulation.services[component.id];
    const postgres = context.simulation.postgres[component.id];

    if (cache && glyphCatalog.type === "cache") {
      const capacity = glyphCatalog.capacity ?? 16;
      const visual = cacheVisual(component.id, context.runId, capacity, cache, progress, tick);
      return [{ componentId: component.id, ...visual }];
    }

    if (glyphCatalog.type === "cdn" && cache) {
      const passTarget = Math.ceil(cache.hitRate * 6 * progress);
      return [
        {
          componentId: component.id,
          processingCount: 0,
          passCount: passTarget,
          state: passTarget > 0 ? "processing" : "idle",
        },
      ];
    }

    if (service && glyphCatalog.type === "server") {
      const size = (glyphCatalog.machineSize ?? "medium") as "small" | "medium" | "large";
      const visual = serverVisual(service, size, progress);
      return [{ componentId: component.id, ...visual }];
    }

    if (postgres && glyphCatalog.type === "sql_db") {
      const tier = (glyphCatalog.machineSize ?? "medium") as "small" | "medium" | "large";
      const visual = storeVisual(postgres, tier, progress);
      return [{ componentId: component.id, ...visual }];
    }

    return [];
  });
}
