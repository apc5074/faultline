"use client";

import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";

import { computeOrthogonalPath, hopArcPath, strokeWidthForLoad, type HopMarker } from "./ink-edge-routing";

export type InkEdgeData = {
  load: number;
  active: boolean;
  stale: boolean;
  offset: number;
  hops?: HopMarker[];
  pulse?: boolean;
  peeling?: boolean;
  semanticZoomOut?: boolean;
};

type InkFlowEdge = Edge<InkEdgeData, "ink">;

export function InkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<InkFlowEdge>) {
  const offset = data?.offset ?? 0;
  const path = computeOrthogonalPath(sourceX, sourceY, targetX, targetY, offset);
  const load = data?.load ?? 0;
  const active = data?.active ?? false;
  const stale = data?.stale ?? false;
  const semanticZoomOut = data?.semanticZoomOut ?? false;
  const strokeWidth = semanticZoomOut
    ? active
      ? 1 + load * 1.5
      : 1
    : strokeWidthForLoad(load, active && !stale);
  const stroke = stale ? "var(--color-ink-hairline)" : "var(--color-ink)";
  const opacity = stale ? 0.45 : data?.peeling ? 0.35 : 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={[
          data?.peeling ? "ink-edge--peeling" : "",
          data?.pulse && !semanticZoomOut ? "ink-edge--pulse" : "",
          semanticZoomOut ? "ink-edge--stream" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          stroke,
          strokeWidth,
          strokeLinecap: "square",
          strokeLinejoin: "miter",
          opacity,
        }}
      />
      {data?.pulse && !semanticZoomOut ? (
        <path
          d={path}
          className="ink-edge__travel-pulse"
          fill="none"
          stroke={stroke}
          strokeWidth={Math.max(strokeWidth, 1.5)}
          pathLength={100}
        />
      ) : null}
      {!semanticZoomOut &&
        (data?.hops ?? []).map((hop, index) => (
          <path
            key={`${id}-hop-${index}`}
            d={hopArcPath(hop.x, hop.y)}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            opacity={opacity}
            strokeLinecap="round"
          />
        ))}
    </>
  );
}
