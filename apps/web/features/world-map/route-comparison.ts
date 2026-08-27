type TrafficEventLike = {
  type: string;
  componentId?: string;
  data: Readonly<Record<string, number | string>>;
};

export type RouteEvidence = {
  identity: string;
  originRegion: string;
  destinationRegion: string;
  kind: string;
  componentId: string;
  deploymentId?: string;
  rps: number;
  networkLatencyMs?: number;
};

export type RouteComparison = {
  identity: string;
  baseline?: RouteEvidence;
  outcome?: RouteEvidence;
  rpsDelta: number;
};

function trafficRps(data: TrafficEventLike["data"]): number {
  return [data.requestsPerSecond, data.readRequestsPerSecond, data.writeRequestsPerSecond]
    .reduce<number>((sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);
}

/** Projects only geographic traffic_routed event fields into a comparable route record. */
export function geographicRoutesFromEvents(events: readonly TrafficEventLike[] | undefined): RouteEvidence[] {
  const routes = new Map<string, RouteEvidence>();
  for (const event of events ?? []) {
    if (event.type !== "traffic_routed" || !event.componentId) continue;
    const originRegion = event.data.originRegion;
    const destinationRegion = event.data.destinationRegion;
    const kind = event.data.kind;
    if (typeof originRegion !== "string" || typeof destinationRegion !== "string" || typeof kind !== "string") continue;
    const deploymentId = typeof event.data.deploymentId === "string" ? event.data.deploymentId : undefined;
    const identity = [originRegion, destinationRegion, kind, event.componentId, deploymentId ?? ""].join("|");
    const rps = trafficRps(event.data);
    const existing = routes.get(identity);
    routes.set(identity, {
      identity,
      originRegion,
      destinationRegion,
      kind,
      componentId: event.componentId,
      ...(deploymentId ? { deploymentId } : {}),
      rps: (existing?.rps ?? 0) + rps,
      ...(typeof event.data.networkLatencyMs === "number" ? { networkLatencyMs: event.data.networkLatencyMs } : {}),
    });
  }
  return [...routes.values()].sort((left, right) => left.identity.localeCompare(right.identity));
}

/** Compares simulator-provided route identities/values; never chooses a route. */
export function compareGeographicRoutes(
  baselineEvents: readonly TrafficEventLike[] | undefined,
  outcomeEvents: readonly TrafficEventLike[] | undefined,
): RouteComparison[] {
  const baseline = new Map(geographicRoutesFromEvents(baselineEvents).map((route) => [route.identity, route]));
  const outcome = new Map(geographicRoutesFromEvents(outcomeEvents).map((route) => [route.identity, route]));
  const ids = [...new Set([...baseline.keys(), ...outcome.keys()])];
  return ids.map((identity) => {
    const before = baseline.get(identity);
    const after = outcome.get(identity);
    return { identity, baseline: before, outcome: after, rpsDelta: (after?.rps ?? 0) - (before?.rps ?? 0) };
  }).filter((comparison) => comparison.rpsDelta !== 0 || comparison.baseline?.networkLatencyMs !== comparison.outcome?.networkLatencyMs)
    .sort((left, right) => Math.abs(right.rpsDelta) - Math.abs(left.rpsDelta) || left.identity.localeCompare(right.identity));
}
