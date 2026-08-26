"use client";

import { useMemo } from "react";

import {
  getRegion,
  getRegions,
  isValidRegion,
  postgresRoleFromDeployment,
  serviceInstancesFromDeployment,
  type Architecture,
  type ChallengeDefinition,
  type ComponentInstance,
  type RegionId,
} from "@faultline/core";
import type { GeographicRoute } from "@faultline/simulator";

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 520;

export type WorldMapSelection =
  | { kind: "region"; regionId: RegionId }
  | { kind: "deployment"; componentId: string; deploymentId: string }
  | null;

type DeploymentMarker = {
  key: string;
  componentId: string;
  deploymentId: string;
  regionId: RegionId;
  label: string;
  kind: "service" | "redis" | "postgres-primary" | "postgres-replica" | "other";
  offsetIndex: number;
};

/** Aggregated arc for rendering — derived from simulator routes, not invented. */
type TrafficArc = {
  key: string;
  originRegion: RegionId;
  destinationRegion: RegionId;
  kind: GeographicRoute["kind"];
  rps: number;
  componentIds: readonly string[];
  deploymentIds: readonly string[];
  crossRegion: boolean;
};

function deploymentLabel(component: ComponentInstance, deploymentId: string): { label: string; kind: DeploymentMarker["kind"] } {
  const deployment = component.deployments.find((entry) => entry.id === deploymentId);
  if (!deployment) return { label: component.type, kind: "other" };

  if (component.type === "service") {
    const instances = serviceInstancesFromDeployment(deployment) ?? 0;
    return { label: `API ×${instances}`, kind: "service" };
  }
  if (component.type === "redis") {
    return { label: "Redis", kind: "redis" };
  }
  if (component.type === "postgres") {
    const role = postgresRoleFromDeployment(deployment);
    if (role === "primary") return { label: "PG primary", kind: "postgres-primary" };
    if (role === "replica") return { label: "PG replica", kind: "postgres-replica" };
    return { label: "Postgres", kind: "other" };
  }
  return { label: component.type, kind: "other" };
}

function toMapPoint(x: number, y: number): { cx: number; cy: number } {
  return { cx: x * MAP_WIDTH, cy: y * MAP_HEIGHT };
}

function collectDeployments(architecture: Architecture): DeploymentMarker[] {
  const markers: DeploymentMarker[] = [];
  const offsetByRegion = new Map<string, number>();

  for (const component of architecture.components) {
    for (const deployment of component.deployments) {
      if (!isValidRegion(deployment.regionId)) continue;
      const offsetIndex = offsetByRegion.get(deployment.regionId) ?? 0;
      offsetByRegion.set(deployment.regionId, offsetIndex + 1);
      const { label, kind } = deploymentLabel(component, deployment.id);
      markers.push({
        key: `${component.id}:${deployment.id}`,
        componentId: component.id,
        deploymentId: deployment.id,
        regionId: deployment.regionId,
        label,
        kind,
        offsetIndex,
      });
    }
  }

  return markers;
}

/** Merge identical origin→destination→kind routes so the map stays readable. */
function aggregateRoutes(routes: readonly GeographicRoute[]): TrafficArc[] {
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

function arcPath(origin: RegionId, destination: RegionId, kind: GeographicRoute["kind"]): string {
  const from = getRegion(origin);
  const to = getRegion(destination);
  const start = toMapPoint(from.coordinates.x, from.coordinates.y);
  const end = toMapPoint(to.coordinates.x, to.coordinates.y);

  if (origin === destination) {
    // Local traffic: small loop beside the region marker.
    const kindBias = kind === "write" ? 18 : kind === "read" ? -18 : 0;
    const r = 28;
    return `M ${start.cx + kindBias} ${start.cy - 8}
      C ${start.cx + kindBias + r} ${start.cy - r}, ${start.cx + kindBias + r} ${start.cy + r}, ${start.cx + kindBias} ${start.cy + 8}`;
  }

  const midX = (start.cx + end.cx) / 2;
  const midY = (start.cy + end.cy) / 2;
  const dx = end.cx - start.cx;
  const dy = end.cy - start.cy;
  const length = Math.hypot(dx, dy) || 1;
  // Perpendicular bulge — larger for longer hops; kind offsets parallel arcs slightly.
  const kindOffset = kind === "write" ? 18 : kind === "read" ? -14 : 0;
  const bulge = Math.min(90, 24 + length * 0.18) + kindOffset;
  const cx = midX - (dy / length) * bulge;
  const cy = midY + (dx / length) * bulge;
  return `M ${start.cx} ${start.cy} Q ${cx} ${cy} ${end.cx} ${end.cy}`;
}

function strokeForVolume(rps: number, maxRps: number): { width: number; opacity: number } {
  if (maxRps <= 0) return { width: 1.5, opacity: 0.45 };
  const ratio = Math.min(1, rps / maxRps);
  return {
    width: 1.25 + ratio * 5.5,
    opacity: 0.35 + ratio * 0.55,
  };
}

function arcHighlighted(arc: TrafficArc, selection: WorldMapSelection, selectedComponentId: string | null): boolean {
  if (selectedComponentId && arc.componentIds.includes(selectedComponentId)) return true;
  if (selection?.kind === "region") {
    return arc.originRegion === selection.regionId || arc.destinationRegion === selection.regionId;
  }
  if (selection?.kind === "deployment") {
    return (
      arc.componentIds.includes(selection.componentId) ||
      arc.deploymentIds.includes(selection.deploymentId)
    );
  }
  return false;
}

export function WorldMap({
  architecture,
  challenge,
  selectedComponentId,
  selection,
  geographicRoutes,
  routesActive,
  onSelectComponent,
  onSelectRegion,
}: {
  architecture: Architecture;
  challenge: ChallengeDefinition;
  selectedComponentId: string | null;
  selection: WorldMapSelection;
  /** Simulator geographicRoutes — only drawn when routesActive. */
  geographicRoutes: readonly GeographicRoute[];
  routesActive: boolean;
  onSelectComponent: (componentId: string) => void;
  onSelectRegion: (regionId: RegionId) => void;
}) {
  const regions = getRegions();
  const deployments = useMemo(() => collectDeployments(architecture), [architecture]);

  const trafficByRegion = useMemo(() => {
    const totalRedirect =
      challenge.workload.requestsPerSecond * challenge.workload.readRatio;
    const map = new Map<RegionId, { fraction: number; redirectRps: number }>();
    for (const share of challenge.geographicDistribution ?? []) {
      if (!isValidRegion(share.regionId)) continue;
      map.set(share.regionId, {
        fraction: share.fraction,
        redirectRps: totalRedirect * share.fraction,
      });
    }
    return map;
  }, [challenge]);

  const arcs = useMemo(
    () => (routesActive ? aggregateRoutes(geographicRoutes) : []),
    [routesActive, geographicRoutes],
  );
  const maxArcRps = arcs.reduce((max, arc) => Math.max(max, arc.rps), 0);
  const anyHighlight = arcs.some((arc) => arcHighlighted(arc, selection, selectedComponentId));

  return (
    <div className="world-map" aria-label="World architecture map">
      <svg
        className="world-map__svg"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label="Educational world map of regions, deployments, and traffic arcs"
      >
        <defs>
          <linearGradient id="world-ocean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#121820" />
            <stop offset="100%" stopColor="#0a0e14" />
          </linearGradient>
          <marker id="world-arc-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" className="world-map__arc-arrow" />
          </marker>
        </defs>

        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#world-ocean)" />

        <g className="world-map__land" aria-hidden="true">
          <ellipse cx="180" cy="210" rx="120" ry="70" />
          <ellipse cx="280" cy="280" rx="55" ry="80" />
          <ellipse cx="500" cy="170" rx="90" ry="55" />
          <ellipse cx="560" cy="250" rx="40" ry="70" />
          <ellipse cx="700" cy="250" rx="70" ry="55" />
          <ellipse cx="780" cy="300" rx="45" ry="35" />
          <ellipse cx="860" cy="200" rx="50" ry="40" />
        </g>

        <g className="world-map__grid" aria-hidden="true">
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={`v-${fraction}`}
              x1={fraction * MAP_WIDTH}
              y1={0}
              x2={fraction * MAP_WIDTH}
              y2={MAP_HEIGHT}
            />
          ))}
          {[0.33, 0.66].map((fraction) => (
            <line
              key={`h-${fraction}`}
              x1={0}
              y1={fraction * MAP_HEIGHT}
              x2={MAP_WIDTH}
              y2={fraction * MAP_HEIGHT}
            />
          ))}
        </g>

        <g className="world-map__arcs" aria-label={routesActive ? "Simulated traffic arcs" : undefined}>
          {arcs.map((arc) => {
            const { width, opacity } = strokeForVolume(arc.rps, maxArcRps);
            const highlighted = arcHighlighted(arc, selection, selectedComponentId);
            const dimmed = anyHighlight && !highlighted;
            return (
              <path
                key={arc.key}
                className={[
                  "world-map__arc",
                  `world-map__arc--${arc.kind}`,
                  arc.crossRegion ? "world-map__arc--cross" : "world-map__arc--local",
                  highlighted ? "world-map__arc--highlighted" : "",
                  dimmed ? "world-map__arc--dimmed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                d={arcPath(arc.originRegion, arc.destinationRegion, arc.kind)}
                style={{
                  strokeWidth: width,
                  opacity: dimmed ? Math.min(0.18, opacity * 0.35) : opacity,
                }}
                markerEnd={arc.crossRegion ? "url(#world-arc-arrow)" : undefined}
              >
                <title>
                  {`${arc.originRegion} → ${arc.destinationRegion} (${arc.kind}) · ${Math.round(arc.rps).toLocaleString("en-US")} rps`}
                </title>
              </path>
            );
          })}
        </g>

        {regions.map((region) => {
          const point = toMapPoint(region.coordinates.x, region.coordinates.y);
          const traffic = trafficByRegion.get(region.id);
          const selected =
            selection?.kind === "region" && selection.regionId === region.id;
          const healthy = region.health === "healthy";

          return (
            <g
              key={region.id}
              className={[
                "world-map__region",
                selected ? "world-map__region--selected" : "",
                healthy ? "" : "world-map__region--unhealthy",
              ]
                .filter(Boolean)
                .join(" ")}
              transform={`translate(${point.cx} ${point.cy})`}
            >
              <circle
                className="world-map__region-hit"
                r={48}
                onClick={() => onSelectRegion(region.id)}
              />
              <circle className="world-map__region-ring" r={22} />
              <circle className="world-map__region-dot" r={7} />
              <text className="world-map__region-label" y={-28} textAnchor="middle">
                {region.label}
              </text>
              {traffic ? (
                <text className="world-map__region-traffic" y={38} textAnchor="middle">
                  {Math.round(traffic.fraction * 100)}% ·{" "}
                  {Math.round(traffic.redirectRps).toLocaleString("en-US")} rps
                </text>
              ) : (
                <text className="world-map__region-traffic" y={38} textAnchor="middle">
                  no origin traffic
                </text>
              )}
            </g>
          );
        })}

        {deployments.map((marker) => {
          const region = getRegion(marker.regionId);
          const point = toMapPoint(region.coordinates.x, region.coordinates.y);
          const stackOffset = marker.offsetIndex * 22;
          const selected =
            selectedComponentId === marker.componentId ||
            (selection?.kind === "deployment" &&
              selection.componentId === marker.componentId &&
              selection.deploymentId === marker.deploymentId);

          return (
            <g
              key={marker.key}
              className={[
                "world-map__deployment",
                `world-map__deployment--${marker.kind}`,
                selected ? "world-map__deployment--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              transform={`translate(${point.cx + 36} ${point.cy - 18 + stackOffset})`}
              onClick={() => onSelectComponent(marker.componentId)}
            >
              <rect className="world-map__deployment-chip" x={0} y={-10} rx={4} ry={4} width={108} height={20} />
              <text className="world-map__deployment-label" x={8} y={4}>
                {marker.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="world-map__legend" aria-label="Map legend">
        <span className="world-map__legend-item world-map__legend-item--origin">Traffic origin</span>
        <span className="world-map__legend-item world-map__legend-item--service">Service</span>
        <span className="world-map__legend-item world-map__legend-item--redis">Redis</span>
        <span className="world-map__legend-item world-map__legend-item--primary">PG primary</span>
        <span className="world-map__legend-item world-map__legend-item--replica">PG replica</span>
        {routesActive ? (
          <>
            <span className="world-map__legend-item world-map__legend-item--arc-request">Request arc</span>
            <span className="world-map__legend-item world-map__legend-item--arc-write">Write arc</span>
            <span className="world-map__legend-item world-map__legend-item--arc-read">Read arc</span>
          </>
        ) : (
          <span className="world-map__legend-hint">Run simulation to show traffic arcs</span>
        )}
      </div>
    </div>
  );
}
