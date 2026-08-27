import type { Architecture, ComponentInstance } from "@faultline/core";
import { componentRegistry } from "@faultline/component-catalog";
import type { HotKeyScenarioResult } from "@faultline/simulator";

import type { GlyphSimulationResult } from "../playground-glyphs/state.ts";
import { glyphPropsFromComponent } from "../playground-glyphs/catalog-map.ts";

import { impactSlotSeed, randomizedImpactSlots } from "./impact-slots.ts";
import type { ComponentPlaybackVisual } from "./types";
import {
  buildComponentVolumeShares,
  mechanismCellsFromShare,
  type ComponentVolumeShare,
} from "./volume-share-visuals.ts";

export interface PlaybackVisualContext {
  runId: string;
  architecture: Architecture;
  components: readonly ComponentInstance[];
  simulation: GlyphSimulationResult & { hotKey?: HotKeyScenarioResult };
  /** Challenge redirect RPS — share denominator for LP-05 visuals. */
  redirectRps: number;
}

function cacheVisual(
  componentId: string,
  runId: string,
  capacity: number,
  share: ComponentVolumeShare | undefined,
  cache: NonNullable<GlyphSimulationResult["caches"]>[string],
  progress: number,
  tick: number,
): Pick<ComponentPlaybackVisual, "processingCount" | "cacheHitFlash" | "processingSlotIndices" | "state"> {
  const slots = Math.max(1, capacity);
  const targetCells = mechanismCellsFromShare(share?.share01 ?? 0, slots, cache.saturated);
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
  share: ComponentVolumeShare | undefined,
  service: NonNullable<GlyphSimulationResult["services"]>[string],
  machineSize: "small" | "medium" | "large",
  progress: number,
): Pick<ComponentPlaybackVisual, "processingCount" | "state"> {
  const maxBays = machineSize === "small" ? 1 : machineSize === "medium" ? 3 : 5;
  const saturated = service.state === "saturated" || service.state === "critical";
  const target = mechanismCellsFromShare(share?.share01 ?? 0, maxBays, saturated);
  const visible = Math.min(maxBays, Math.max(0, Math.ceil(target * progress)));
  return {
    processingCount: visible,
    state: saturated ? "overloaded" : visible > 0 ? "processing" : "idle",
  };
}

function storeVisual(
  share: ComponentVolumeShare | undefined,
  postgres: NonNullable<GlyphSimulationResult["postgres"]>[string],
  machineSize: "small" | "medium" | "large",
  progress: number,
): Pick<ComponentPlaybackVisual, "processingCount" | "state"> {
  const bands = machineSize === "small" ? 3 : machineSize === "large" ? 5 : 4;
  const saturated = postgres.state === "saturated" || postgres.state === "critical";
  const target = mechanismCellsFromShare(share?.share01 ?? 0, bands, saturated);
  const visible = Math.min(bands, Math.max(0, Math.ceil(target * progress)));
  return {
    processingCount: visible,
    state: saturated ? "overloaded" : visible > 0 ? "processing" : "idle",
  };
}

/** Maps authoritative sim metrics to glyph playback visuals via global path share. */
export function buildComponentPlaybackVisuals(
  context: PlaybackVisualContext,
  visibleEventCount: number,
  totalEvents: number,
): ComponentPlaybackVisual[] {
  const progress = totalEvents > 0 ? Math.min(1, visibleEventCount / totalEvents) : 1;
  const tick = visibleEventCount;
  const shares = buildComponentVolumeShares({
    redirectRps: context.redirectRps,
    simulation: context.simulation,
  });

  return context.components.flatMap((component) => {
    const definition = componentRegistry.get(component.type);
    const glyphCatalog = glyphPropsFromComponent(component, definition);
    const cache = context.simulation.caches?.[component.id];
    const service = context.simulation.services[component.id];
    const postgres = context.simulation.postgres[component.id];
    const share = shares.get(component.id);

    if (cache && glyphCatalog.type === "cache") {
      const capacity = glyphCatalog.capacity ?? 16;
      const visual = cacheVisual(component.id, context.runId, capacity, share, cache, progress, tick);
      return [{ componentId: component.id, ...visual }];
    }

    if (glyphCatalog.type === "cdn" && cache) {
      const passTarget = mechanismCellsFromShare(share?.share01 ?? 0, 6, cache.saturated);
      const visiblePass = Math.min(6, Math.max(0, Math.ceil(passTarget * progress)));
      return [
        {
          componentId: component.id,
          processingCount: 0,
          passCount: visiblePass,
          state: cache.saturated ? "overloaded" : visiblePass > 0 ? "processing" : "idle",
        },
      ];
    }

    if (service && glyphCatalog.type === "server") {
      const size = (glyphCatalog.machineSize ?? "medium") as "small" | "medium" | "large";
      const visual = serverVisual(share, service, size, progress);
      return [{ componentId: component.id, ...visual }];
    }

    if (postgres && glyphCatalog.type === "sql_db") {
      const tier = (glyphCatalog.machineSize ?? "medium") as "small" | "medium" | "large";
      const visual = storeVisual(share, postgres, tier, progress);
      return [{ componentId: component.id, ...visual }];
    }

    return [];
  });
}
