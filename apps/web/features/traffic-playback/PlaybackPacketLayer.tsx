"use client";

import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture } from "@faultline/core";
import { useViewport } from "@xyflow/react";
import { useMemo } from "react";

import {
  computeParallelOffsets,
  estimatePortPosition,
} from "@/features/architecture-canvas/ink-edge-routing";

import { PlaybackPacketGlyph } from "./PlaybackPacketGlyph";
import { pointOnOrthogonalPath } from "./path-geometry";
import type { PlaybackPacket } from "./types";

/** Global packet overlay — matches Implement Plan Canvas.tsx packet rendering. */
export function PlaybackPacketLayer({
  architecture,
  packets,
  semanticZoomOut = false,
}: {
  architecture: Architecture;
  packets: readonly PlaybackPacket[];
  semanticZoomOut?: boolean;
}) {
  const { x, y, zoom } = useViewport();

  const offsets = useMemo(
    () =>
      computeParallelOffsets(
        architecture.connections.map((connection) => ({
          id: connection.id,
          sourceId: connection.sourceComponentId,
          targetId: connection.targetComponentId,
        })),
      ),
    [architecture.connections],
  );

  const glyphs = useMemo(() => {
    return packets.flatMap((packet) => {
      const connection = architecture.connections.find((candidate) => candidate.id === packet.connectionId);
      if (!connection) return [];

      const source = architecture.components.find((component) => component.id === connection.sourceComponentId);
      const target = architecture.components.find((component) => component.id === connection.targetComponentId);
      if (!source || !target) return [];

      const from = estimatePortPosition(source, componentRegistry.get(source.type), connection.sourcePortId);
      const to = estimatePortPosition(target, componentRegistry.get(target.type), connection.targetPortId);
      const offset = offsets.get(connection.id) ?? 0;
      const progress = packet.reverse ? 1 - packet.progress : packet.progress;
      const point = pointOnOrthogonalPath(from.x, from.y, to.x, to.y, offset, progress, false);

      return [{ id: packet.id, shape: packet.shape, x: point.x, y: point.y }];
    });
  }, [architecture.components, architecture.connections, offsets, packets]);

  if (semanticZoomOut || glyphs.length === 0) return null;

  return (
    <svg className="playback-packet-layer" aria-hidden="true">
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        {glyphs.map((glyph) => (
          <PlaybackPacketGlyph key={glyph.id} shape={glyph.shape} x={glyph.x} y={glyph.y} />
        ))}
      </g>
    </svg>
  );
}
