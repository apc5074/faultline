import type { ComponentDefinition } from "@faultline/core";

export const PLAYGROUND_NODE_LABEL_GAP = 4;
export const PLAYGROUND_NODE_LABEL_HEIGHT = 14;

export function portOffsetY(
  definition: ComponentDefinition,
  portId: string,
  glyphHeight: number,
): number {
  const height = Number.isFinite(glyphHeight) && glyphHeight > 0 ? glyphHeight : 56;
  const port = definition.ports.find((candidate) => candidate.id === portId);
  if (!port) return height / 2;

  const sameDirection = definition.ports.filter((candidate) => candidate.direction === port.direction);
  const index = sameDirection.findIndex((candidate) => candidate.id === portId);
  const count = sameDirection.length;
  if (count <= 0 || index < 0) return height / 2;

  return (height / (count + 1)) * (index + 1);
}

export function playgroundNodeHeight(glyphHeight: number): number {
  const height = Number.isFinite(glyphHeight) && glyphHeight > 0 ? glyphHeight : 56;
  return height + PLAYGROUND_NODE_LABEL_GAP + PLAYGROUND_NODE_LABEL_HEIGHT;
}
