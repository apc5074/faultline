export type PlaybackSpeed = 0.5 | 1 | 2;

export type PacketShape = "request" | "response" | "write" | "event" | "rejected";

export interface PlaybackPacket {
  id: string;
  shape: PacketShape;
  connectionId: string;
  progress: number;
  reverse?: boolean;
  dwellComponentId?: string;
  dwellProgress?: number;
}

export interface ComponentPlaybackVisual {
  componentId: string;
  processingCount: number;
  /** Postgres meters remain distinct; neither is inferred from effective pressure. */
  readProcessingCount?: number;
  writeProcessingCount?: number;
  armAngle?: number;
  passCount?: number;
  state: "idle" | "processing" | "warning" | "critical" | "saturated" | "overloaded" | "failed";
  /** Compact simulator-derived limiting-resource summary, shown beside the glyph. */
  evidenceLabel?: string;
  /** Redis: brief solid fill on cache hit (no flicker). */
  cacheHitFlash?: boolean;
  /** Cache cubes: seeded random slot order (servers stay sequential). */
  processingSlotIndices?: readonly number[];
  queueDepth?: number;
  slotCount?: number;
  objectMarks?: number;
}

export interface EdgeLoad {
  connectionId: string;
  weight: number;
}

export interface RouteLinger {
  id: string;
  connectionId: string;
  startedAt: number;
}

export interface PlaybackFrame {
  packets: readonly PlaybackPacket[];
  edgeLoads: readonly EdgeLoad[];
  componentVisuals: readonly ComponentPlaybackVisual[];
  routeLingers: readonly RouteLinger[];
  tick: number;
}
