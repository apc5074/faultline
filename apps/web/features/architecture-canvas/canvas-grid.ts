export const PLAYGROUND_GRID_SIZE = 20;

export const PLAYGROUND_SNAP_GRID: [number, number] = [PLAYGROUND_GRID_SIZE, PLAYGROUND_GRID_SIZE];

/** Closest zoom-out allowed — still roomy, not infinite empty space. */
export const PLAYGROUND_MIN_ZOOM = 0.55;
/** Closest zoom-in allowed. */
export const PLAYGROUND_MAX_ZOOM = 1.8;

/**
 * Pan bounds in flow coordinates. Keeps the viewport inside a reasonable
 * design board (~2500×1500) instead of endless empty canvas.
 */
export const PLAYGROUND_TRANSLATE_EXTENT: [[number, number], [number, number]] = [
  [-160, -160],
  [2680, 1680],
];

/** Where nodes may be dragged — slightly inside the pan bounds. */
export const PLAYGROUND_NODE_EXTENT: [[number, number], [number, number]] = [
  [0, 0],
  [2400, 1400],
];

/** Starter traffic source — left side of the board, mid height. */
export const PLAYGROUND_STARTER_TRAFFIC_POSITION = { x: 60, y: 320 };

/** Starter service — immediately right of traffic, ready to extend further right. */
export const PLAYGROUND_STARTER_SERVICE_POSITION = { x: 280, y: 300 };

/**
 * Initial viewport: traffic + service sit on the left with open space to build rightward.
 * Screen ≈ flow * zoom + viewport offset.
 */
export const PLAYGROUND_DEFAULT_VIEWPORT = { x: 48, y: 24, zoom: 1 } as const;

export function snapToGrid(value: number): number {
  return Math.round(value / PLAYGROUND_GRID_SIZE) * PLAYGROUND_GRID_SIZE;
}

export function snapPosition(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: snapToGrid(position.x),
    y: snapToGrid(position.y),
  };
}

/** Snap and keep a position inside the playable node board. */
export function clampToPlaygroundBoard(position: { x: number; y: number }): { x: number; y: number } {
  const [[minX, minY], [maxX, maxY]] = PLAYGROUND_NODE_EXTENT;
  return snapPosition({
    x: Math.min(maxX, Math.max(minX, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y)),
  });
}
