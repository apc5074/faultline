import type { Architecture, ComponentInstance } from "@faultline/core";
import { componentRegistry } from "@faultline/component-catalog";
import type { HotKeyScenarioResult } from "@faultline/simulator";

import type { GlyphSimulationResult } from "../playground-glyphs/state.ts";
import { glyphEvidenceLabel } from "../playground-glyphs/state.ts";
import { glyphPropsFromComponent } from "../playground-glyphs/catalog-map.ts";

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
  cache: NonNullable<GlyphSimulationResult["caches"]>[string],
): Pick<ComponentPlaybackVisual, "processingCount" | "cacheHitFlash" | "processingSlotIndices" | "state"> {
  // During motion Redis is lit only by a packet actually dwelling here—never
  // from an aggregate share or a tick-driven slot permutation.
  return {
    processingCount: 0,
    processingSlotIndices: [],
    cacheHitFlash: false,
    state: cache.saturated ? "overloaded" : "idle",
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
    state: service.state === "healthy" ? (visible > 0 ? "processing" : "idle") : service.state,
  };
}

function storeVisual(
  postgres: NonNullable<GlyphSimulationResult["postgres"]>[string],
  machineSize: "small" | "medium" | "large",
): Pick<ComponentPlaybackVisual, "processingCount" | "readProcessingCount" | "writeProcessingCount" | "state"> {
  const bands = machineSize === "small" ? 3 : machineSize === "large" ? 5 : 4;
  // Postgres pressure is a settled simulator metric, not packet choreography.
  // Keep the read/write hash bands fixed at their quarter/half/full level while
  // packets move independently through the canvas.
  const readBands = Math.min(bands, Math.ceil(Math.max(0, postgres.readUtilization) * bands));
  const writeBands = Math.min(bands, Math.ceil(Math.max(0, postgres.writeUtilization) * bands));
  const visible = Math.max(readBands, writeBands);
  return {
    processingCount: visible,
    readProcessingCount: readBands,
    writeProcessingCount: writeBands,
    state: postgres.state === "healthy" ? (visible > 0 ? "processing" : "idle") : postgres.state,
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
      const visual = cacheVisual(cache);
      return [{ componentId: component.id, ...visual, evidenceLabel: glyphEvidenceLabel(component.id, context.simulation) }];
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
          evidenceLabel: glyphEvidenceLabel(component.id, context.simulation),
        },
      ];
    }

    if (service && glyphCatalog.type === "server") {
      const size = (glyphCatalog.machineSize ?? "medium") as "small" | "medium" | "large";
      const visual = serverVisual(share, service, size, progress);
      return [{ componentId: component.id, ...visual, evidenceLabel: glyphEvidenceLabel(component.id, context.simulation) }];
    }

    if (postgres && glyphCatalog.type === "sql_db") {
      const tier = (glyphCatalog.machineSize ?? "medium") as "small" | "medium" | "large";
      const visual = storeVisual(postgres, tier);
      return [{ componentId: component.id, ...visual, evidenceLabel: glyphEvidenceLabel(component.id, context.simulation) }];
    }

    return [];
  });
}
