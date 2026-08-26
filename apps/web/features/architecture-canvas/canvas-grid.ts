export const PLAYGROUND_GRID_SIZE = 20;

export const PLAYGROUND_SNAP_GRID: [number, number] = [PLAYGROUND_GRID_SIZE, PLAYGROUND_GRID_SIZE];

export function snapToGrid(value: number): number {
  return Math.round(value / PLAYGROUND_GRID_SIZE) * PLAYGROUND_GRID_SIZE;
}

export function snapPosition(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: snapToGrid(position.x),
    y: snapToGrid(position.y),
  };
}
