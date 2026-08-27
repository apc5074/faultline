import type { Architecture, ComponentInstance } from "@faultline/core";
import type { HotKeyScenarioResult } from "@faultline/simulator";

import type { GlyphSimulationResult } from "../playground-glyphs/state.ts";

import { selectComponentVisualEvidence } from "./component-visual-evidence.ts";
import type { ComponentPlaybackVisual } from "./types";

export interface PlaybackVisualContext {
  runId: string;
  architecture: Architecture;
  components: readonly ComponentInstance[];
  simulation: GlyphSimulationResult & { hotKey?: HotKeyScenarioResult };
  /** Challenge redirect RPS — share denominator for LP-05 visuals. */
  redirectRps: number;
}

/** Maps ordered authoritative evidence to glyph playback visuals. */
export function buildComponentPlaybackVisuals(
  context: PlaybackVisualContext,
  visibleEventCount: number,
  totalEvents: number,
): ComponentPlaybackVisual[] {
  const progress = totalEvents > 0 ? Math.min(1, visibleEventCount / totalEvents) : 1;
  return context.components.map((component) => {
    const evidence = selectComponentVisualEvidence({
      component,
      simulation: context.simulation,
      redirectRps: context.redirectRps,
      progress,
      impactSeed: `${context.runId}:${component.id}:${visibleEventCount}`,
    });
    const { state, ...visual } = evidence;
    return {
      ...visual,
      state: state === "stale" ? "idle" : state,
    } satisfies ComponentPlaybackVisual;
  });
}
