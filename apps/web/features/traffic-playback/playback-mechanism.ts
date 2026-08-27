import type { CatalogGlyphProps, GlyphState } from "@/features/playground-glyphs";

import type { ComponentPlaybackVisual } from "./types";

export type PlaybackMechanismProps = {
  processingCount: number;
  armAngle?: number;
  passCount?: number;
  cacheHitFlash?: boolean;
};

const IDLE_VISUAL: ComponentPlaybackVisual = {
  componentId: "",
  processingCount: 0,
  state: "idle",
};

/** Merge playback visuals with catalog glyph props for mechanism motion. */
export function mechanismPropsFromPlayback(
  visual: ComponentPlaybackVisual | undefined,
  catalog: CatalogGlyphProps,
): PlaybackMechanismProps {
  const playback = visual ?? IDLE_VISUAL;

  return {
    processingCount: playback.processingCount,
    armAngle: playback.armAngle ?? catalog.armAngle,
    passCount: playback.passCount ?? 0,
    cacheHitFlash: playback.cacheHitFlash,
  };
}

export function glyphStateFromPlayback(
  visual: ComponentPlaybackVisual | undefined,
): "idle" | "processing" | "overloaded" {
  const playback = visual ?? IDLE_VISUAL;
  if (playback.state === "overloaded") return "overloaded";
  if (playback.state === "processing" || playback.processingCount > 0 || playback.cacheHitFlash) {
    return "processing";
  }
  return "idle";
}

/** Matches Figma Canvas: selected override, otherwise live tick `comp.state`. */
export function playbackGlyphState(
  visual: ComponentPlaybackVisual | undefined,
  selected: boolean,
): GlyphState {
  if (selected) return "selected";
  switch (visual?.state) {
    case "failed":
      return "failed";
    case "overloaded":
      return "overloaded";
    case "processing":
      return "processing";
    default:
      return "idle";
  }
}
