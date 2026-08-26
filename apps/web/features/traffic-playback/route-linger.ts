import type { RouteLinger } from "./types";

export const ROUTE_LINGER_MS = 1000;

export function createRouteLingers(connectionIds: readonly string[], startedAt = performance.now()): RouteLinger[] {
  return connectionIds.map((connectionId, index) => ({
    id: `${connectionId}-${startedAt}-${index}`,
    connectionId,
    startedAt,
  }));
}

export function mergeRouteLingers(current: readonly RouteLinger[], incoming: readonly RouteLinger[]): RouteLinger[] {
  if (incoming.length === 0) return [...current];
  return [...current, ...incoming];
}

export function pruneRouteLingers(lingers: readonly RouteLinger[], now = performance.now()): RouteLinger[] {
  return lingers.filter((linger) => now - linger.startedAt < ROUTE_LINGER_MS);
}

export function lingerOpacity(startedAt: number, now = performance.now()): number {
  const elapsed = now - startedAt;
  if (elapsed >= ROUTE_LINGER_MS) return 0;
  return 0.85 * (1 - elapsed / ROUTE_LINGER_MS);
}
