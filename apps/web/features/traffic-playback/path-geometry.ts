/** Point along the same orthogonal path used by ink edges. */
export function pointOnOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  offset: number,
  progress: number,
  reverse: boolean,
): { x: number; y: number } {
  const t = reverse ? 1 - progress : progress;
  const midX = (sourceX + targetX) / 2 + offset;
  const points = [
    { x: sourceX, y: sourceY },
    { x: midX, y: sourceY },
    { x: midX, y: targetY },
    { x: targetX, y: targetY },
  ];

  const segments = [
    distance(points[0], points[1]),
    distance(points[1], points[2]),
    distance(points[2], points[3]),
  ];
  const total = segments.reduce((sum, length) => sum + length, 0);
  if (total <= 0) return points[0];

  let remaining = t * total;
  for (let index = 0; index < segments.length; index += 1) {
    const length = segments[index];
    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length;
      return interpolate(points[index], points[index + 1], ratio);
    }
    remaining -= length;
  }
  return points[points.length - 1];
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function interpolate(
  a: { x: number; y: number },
  b: { x: number; y: number },
  ratio: number,
): { x: number; y: number } {
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
  };
}
