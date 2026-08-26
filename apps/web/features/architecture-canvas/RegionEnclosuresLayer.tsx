"use client";

import { useViewport } from "@xyflow/react";

import type { RegionId } from "@faultline/core";

import { regionEnclosureBounds, regionEnclosureLabel } from "@/features/architecture-canvas/region-enclosures";

export function RegionEnclosuresLayer({
  regionIds,
  semanticZoomOut = false,
}: {
  regionIds: readonly RegionId[];
  semanticZoomOut?: boolean;
}) {
  const { x, y, zoom } = useViewport();

  if (regionIds.length === 0) return null;

  return (
    <svg className="region-enclosures-layer" aria-hidden="true">
      <g transform={`translate(${x}, ${y}) scale(${zoom})`}>
        {regionIds.map((regionId) => {
          const bounds = regionEnclosureBounds(regionId);
          return (
            <g key={regionId} className="region-enclosure">
              <rect
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                className="region-enclosure__outline"
              />
              {!semanticZoomOut ? (
                <text x={bounds.x + 8} y={bounds.y + 14} className="region-enclosure__label">
                  {regionEnclosureLabel(regionId)}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
