import type { RegionId } from "@faultline/core";
import type { GeographicRoute } from "@faultline/simulator";

/** Aggregated arc for rendering — derived from simulator routes, not invented. */
export type TrafficArc = {
  key: string;
  originRegion: RegionId;
  destinationRegion: RegionId;
  kind: GeographicRoute["kind"];
  rps: number;
  componentIds: readonly string[];
  deploymentIds: readonly string[];
  crossRegion: boolean;
};

/** Merge identical origin→destination→kind routes so the map stays readable. */
export function aggregateRoutes(routes: readonly GeographicRoute[]): TrafficArc[] {
  const byKey = new Map<string, TrafficArc>();

  for (const route of routes) {
    if (route.rps <= 0) continue;
    const key = `${route.originRegion}|${route.destinationRegion}|${route.kind}`;
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        rps: existing.rps + route.rps,
        componentIds: existing.componentIds.includes(route.componentId)
          ? existing.componentIds
          : [...existing.componentIds, route.componentId],
        deploymentIds: existing.deploymentIds.includes(route.deploymentId)
          ? existing.deploymentIds
          : [...existing.deploymentIds, route.deploymentId],
      });
      continue;
    }
    byKey.set(key, {
      key,
      originRegion: route.originRegion,
      destinationRegion: route.destinationRegion,
      kind: route.kind,
      rps: route.rps,
      componentIds: [route.componentId],
      deploymentIds: [route.deploymentId],
      crossRegion: route.originRegion !== route.destinationRegion,
    });
  }

  return [...byKey.values()].sort((left, right) => right.rps - left.rps);
}
