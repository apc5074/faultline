"use client";

import type { ConnectionLineComponentProps } from "@xyflow/react";

import { computeOrthogonalPath } from "./ink-edge-routing";

export function InkConnectionLine({ fromX, fromY, toX, toY }: ConnectionLineComponentProps) {
  const path = computeOrthogonalPath(fromX, fromY, toX, toY);

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={1}
        strokeDasharray="4 3"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </g>
  );
}
