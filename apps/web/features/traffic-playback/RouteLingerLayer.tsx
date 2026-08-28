"use client";

import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture } from "@faultline/core";
import { useViewport } from "@xyflow/react";
import { useMemo } from "react";

import {
  computeOrthogonalPath,
  computeParallelOffsets,
  estimatePortPosition,
} from "@/features/architecture-canvas/ink-edge-routing";

import { ROUTE_LINGER_MS } from "./route-linger";
import type { RouteLinger } from "./types";

/** Hairline route ghosts that fade after a packet completes a round trip. */
export function RouteLingerLayer({
  architecture,
  lingers,
  semanticZoomOut = false,
}: {
  architecture: Architecture;
  lingers: readonly RouteLinger[];
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

  const paths = useMemo(() => {
    const connectionById = new Map(architecture.connections.map((connection) => [connection.id, connection]));
    return lingers.flatMap((linger) => {
      const connection = connectionById.get(linger.connectionId);
      if (!connection) return [];

      const source = architecture.components.find((component) => component.id === connection.sourceComponentId);
      const target = architecture.components.find((component) => component.id === connection.targetComponentId);
      if (!source || !target) return [];

      const from = estimatePortPosition(source, componentRegistry.get(source.type), connection.sourcePortId);
      const to = estimatePortPosition(target, componentRegistry.get(target.type), connection.targetPortId);
      const offset = offsets.get(connection.id) ?? 0;

      return [
        {
          id: linger.id,
          d: computeOrthogonalPath(from.x, from.y, to.x, to.y, offset),
        },
      ];
    });
  }, [architecture.components, architecture.connections, lingers, offsets]);

  if (semanticZoomOut || paths.length === 0) return null;

  return (
    <svg className="route-linger-layer" aria-hidden="true">
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        {paths.map((path) => (
          <path
            key={path.id}
            d={path.d}
            className="route-linger-path"
            fill="none"
            stroke="var(--color-ink-hairline)"
            strokeWidth={1}
            style={{ ["--route-linger-duration" as string]: `${ROUTE_LINGER_MS}ms` }}
          />
        ))}
      </g>
    </svg>
  );
}
