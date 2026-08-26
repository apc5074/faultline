import type { ComponentDefinition, ComponentInstance } from "@faultline/core";

import { portOffsetY } from "@/features/architecture-canvas/glyph-port-layout";
import { glyphDimensionsForProps, glyphPropsFromComponent } from "@/features/playground-glyphs";

export interface Point {
  x: number;
  y: number;
}

export interface OrthogonalSegment {
  edgeId: string;
  axis: "h" | "v";
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export interface HopMarker {
  x: number;
  y: number;
}

const PARALLEL_OFFSET = 16;

export function computeOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  offset = 0,
): string {
  const midX = (sourceX + targetX) / 2 + offset;
  return `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
}

export function hopArcPath(x: number, y: number, radius = 4): string {
  return `M ${x - radius} ${y} a ${radius} ${radius} 0 0 1 ${radius * 2} 0`;
}

function segmentsFromPath(edgeId: string, path: string): OrthogonalSegment[] {
  const numbers = path.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  if (numbers.length < 8) return [];

  const [x1, y1, mx, , , y2, x2] = numbers;
  return [
    { edgeId, axis: "h", x1, x2: mx, y1, y2: y1 },
    { edgeId, axis: "v", x1: mx, x2: mx, y1, y2 },
    { edgeId, axis: "h", x1: mx, x2: x2, y1: y2, y2 },
  ];
}

function segmentIntersection(a: OrthogonalSegment, b: OrthogonalSegment): Point | null {
  if (a.edgeId === b.edgeId) return null;

  if (a.axis === "h" && b.axis === "v") {
    const y = a.y1;
    const x = b.x1;
    const hMin = Math.min(a.x1, a.x2);
    const hMax = Math.max(a.x1, a.x2);
    const vMin = Math.min(b.y1, b.y2);
    const vMax = Math.max(b.y1, b.y2);
    if (x > hMin && x < hMax && y > vMin && y < vMax) {
      return { x, y };
    }
  }

  if (a.axis === "v" && b.axis === "h") {
    return segmentIntersection(b, a);
  }

  return null;
}

export function computeHopMarkers(paths: Array<{ edgeId: string; path: string }>): Map<string, HopMarker[]> {
  const segments = paths.flatMap(({ edgeId, path }) => segmentsFromPath(edgeId, path));
  const hops = new Map<string, HopMarker[]>();

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const hit = segmentIntersection(segments[i], segments[j]);
      if (!hit) continue;
      const owner = segments[j].edgeId;
      const list = hops.get(owner) ?? [];
      if (!list.some((marker) => marker.x === hit.x && marker.y === hit.y)) {
        list.push(hit);
        hops.set(owner, list);
      }
    }
  }

  return hops;
}

export function connectionPairKey(sourceId: string, targetId: string): string {
  return [sourceId, targetId].sort().join("↔");
}

export function computeParallelOffsets(
  pairs: Array<{ id: string; sourceId: string; targetId: string }>,
): Map<string, number> {
  const grouped = new Map<string, string[]>();

  for (const connection of pairs) {
    const key = connectionPairKey(connection.sourceId, connection.targetId);
    const list = grouped.get(key) ?? [];
    list.push(connection.id);
    grouped.set(key, list);
  }

  const offsets = new Map<string, number>();
  for (const ids of grouped.values()) {
    const sorted = [...ids].sort();
    sorted.forEach((id, index) => {
      const centered = index - (sorted.length - 1) / 2;
      offsets.set(id, centered * PARALLEL_OFFSET);
    });
  }

  return offsets;
}

export function estimatePortPosition(
  component: ComponentInstance,
  definition: ComponentDefinition,
  portId: string,
): Point {
  const glyph = glyphPropsFromComponent(component, definition);
  const { width, height } = glyphDimensionsForProps(glyph);
  const y = component.ui.y + portOffsetY(definition, portId, height);
  const port = definition.ports.find((candidate) => candidate.id === portId);
  const x = port?.direction === "input" ? component.ui.x : component.ui.x + width;
  return { x, y };
}

export function buildEdgePathsFromArchitecture(
  connections: readonly {
    id: string;
    sourceComponentId: string;
    sourcePortId: string;
    targetComponentId: string;
    targetPortId: string;
  }[],
  components: readonly ComponentInstance[],
  getDefinitionFn: (type: string) => ComponentDefinition,
  offsets: Map<string, number>,
): Array<{ edgeId: string; path: string }> {
  return connections.flatMap((connection) => {
    const source = components.find((component) => component.id === connection.sourceComponentId);
    const target = components.find((component) => component.id === connection.targetComponentId);
    if (!source || !target) return [];

    const sourceDefinition = getDefinitionFn(source.type);
    const targetDefinition = getDefinitionFn(target.type);
    const from = estimatePortPosition(source, sourceDefinition, connection.sourcePortId);
    const to = estimatePortPosition(target, targetDefinition, connection.targetPortId);
    const offset = offsets.get(connection.id) ?? 0;
    return [{ edgeId: connection.id, path: computeOrthogonalPath(from.x, from.y, to.x, to.y, offset) }];
  });
}

export function connectionLoadFromEvents(
  events:
    | readonly { type: string; connectionId?: string; data: Readonly<Record<string, number | string>> }[]
    | undefined,
): Map<string, number> {
  const loads = new Map<string, number>();
  if (!events) return loads;

  for (const event of events) {
    if (event.type !== "traffic_routed" || !event.connectionId) continue;
    const directRps = typeof event.data.requestsPerSecond === "number" ? event.data.requestsPerSecond : 0;
    const readRps = typeof event.data.readRequestsPerSecond === "number" ? event.data.readRequestsPerSecond : 0;
    const writeRps = typeof event.data.writeRequestsPerSecond === "number" ? event.data.writeRequestsPerSecond : 0;
    const rps = directRps > 0 ? directRps : readRps + writeRps;
    loads.set(event.connectionId, (loads.get(event.connectionId) ?? 0) + rps);
  }

  return loads;
}

export function normalizeConnectionLoad(load: number, maxLoad: number): number {
  if (maxLoad <= 0 || load <= 0) return 0;
  return Math.min(1, load / maxLoad);
}

export function strokeWidthForLoad(load: number, active: boolean): number {
  if (!active) return 1;
  return 1 + load * 2.5;
}
