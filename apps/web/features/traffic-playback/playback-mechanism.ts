import type { CatalogGlyphProps, GlyphState } from "@/features/playground-glyphs";

import type { ComponentPlaybackVisual } from "./types";

export type PlaybackMechanismProps = {
  processingCount: number;
  readProcessingCount?: number;
  writeProcessingCount?: number;
  armAngle?: number;
  passCount?: number;
  cacheHitFlash?: boolean;
  processingSlotIndices?: readonly number[];
  queueDepth?: number;
  slotCount?: number;
  objectMarks?: number;
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
    readProcessingCount: playback.readProcessingCount,
    writeProcessingCount: playback.writeProcessingCount,
    armAngle: playback.armAngle ?? catalog.armAngle,
    passCount: playback.passCount ?? 0,
    cacheHitFlash: playback.cacheHitFlash,
    processingSlotIndices: playback.processingSlotIndices,
    queueDepth: playback.queueDepth,
    slotCount: playback.slotCount,
    objectMarks: playback.objectMarks,
  };
}

export function glyphStateFromPlayback(
  visual: ComponentPlaybackVisual | undefined,
): GlyphState {
  const playback = visual ?? IDLE_VISUAL;
  if (playback.state !== "idle") return playback.state;
  if (playback.processingCount > 0 || playback.cacheHitFlash) {
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
  return visual?.state ?? "idle";
}
