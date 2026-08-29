"use client";

import { memo, useMemo } from "react";

import { componentRegistry } from "@faultline/component-catalog";
import {
  getRegion,
  getRegions,
  isValidRegion,
  type Architecture,
  type ChallengeDefinition,
  type ComponentInstance,
  type RegionId,
} from "@faultline/core";
import type { GeographicRoute } from "@faultline/simulator";

import { enclosureRegionsForArchitecture } from "@/features/architecture-canvas/region-enclosures";

import { WorldMapDeploymentGlyph } from "./WorldMapDeploymentGlyph";
import { aggregateRoutes, type TrafficArc } from "./geo-route-aggregation";
import type { RegionFailurePresentation } from "./region-failure-presentation";

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 520;

export type WorldMapSelection =
  | { kind: "region"; regionId: RegionId }
  | { kind: "deployment"; componentId: string; deploymentId: string }
  | null;

type DeploymentMarker = {
  key: string;
  component: ComponentInstance;
  componentId: string;
  deploymentId: string;
  regionId: RegionId;
  offsetIndex: number;
};

const COASTLINE_ELLIPSES: ReadonlyArray<{ cx: number; cy: number; rx: number; ry: number }> = [
  { cx: 180, cy: 210, rx: 120, ry: 70 },
  { cx: 280, cy: 280, rx: 55, ry: 80 },
  { cx: 500, cy: 170, rx: 90, ry: 55 },
  { cx: 560, cy: 250, rx: 40, ry: 70 },
  { cx: 700, cy: 250, rx: 70, ry: 55 },
  { cx: 780, cy: 300, rx: 45, ry: 35 },
  { cx: 860, cy: 200, rx: 50, ry: 40 },
];

function toMapPoint(x: number, y: number): { cx: number; cy: number } {
  return { cx: x * MAP_WIDTH, cy: y * MAP_HEIGHT };
}

function regionEnclosureOnMap(regionId: RegionId): { x: number; y: number; width: number; height: number } {
  const point = toMapPoint(getRegion(regionId).coordinates.x, getRegion(regionId).coordinates.y);
  return { x: point.cx - 72, y: point.cy - 52, width: 144, height: 104 };
}

function collectDeployments(architecture: Architecture): DeploymentMarker[] {
  const markers: DeploymentMarker[] = [];
  const offsetByRegion = new Map<string, number>();

  for (const component of architecture.components) {
    if (!componentRegistry.has(component.type)) continue;
    for (const deployment of component.deployments) {
      if (!isValidRegion(deployment.regionId)) continue;
      const offsetIndex = offsetByRegion.get(deployment.regionId) ?? 0;
      offsetByRegion.set(deployment.regionId, offsetIndex + 1);
      markers.push({
        key: `${component.id}:${deployment.id}`,
        component,
        componentId: component.id,
        deploymentId: deployment.id,
        regionId: deployment.regionId,
        offsetIndex,
      });
    }
  }

  return markers;
}

function arcPath(origin: RegionId, destination: RegionId, kind: GeographicRoute["kind"]): string {
  const from = getRegion(origin);
  const to = getRegion(destination);
  const start = toMapPoint(from.coordinates.x, from.coordinates.y);
  const end = toMapPoint(to.coordinates.x, to.coordinates.y);

  if (origin === destination) {
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
  const kindOffset = kind === "write" ? 18 : kind === "read" ? -14 : 0;
  const bulge = Math.min(90, 24 + length * 0.18) + kindOffset;
  const cx = midX - (dy / length) * bulge;
  const cy = midY + (dx / length) * bulge;
  return `M ${start.cx} ${start.cy} Q ${cx} ${cy} ${end.cx} ${end.cy}`;
}

function arcDurationMs(origin: RegionId, destination: RegionId): number {
  const from = getRegion(origin);
  const to = getRegion(destination);
  const distance = Math.hypot(from.coordinates.x - to.coordinates.x, from.coordinates.y - to.coordinates.y);
  return 1200 + distance * 3200;
}

function strokeForVolume(rps: number, maxRps: number): number {
  if (maxRps <= 0) return 1;
  const ratio = Math.min(1, rps / maxRps);
  return 1 + ratio * 4;
}

function arcHighlighted(
  arc: TrafficArc,
  selection: WorldMapSelection,
  selectedComponentId: string | null,
): boolean {
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

export const WorldMap = memo(function WorldMap({
  architecture,
  challenge,
  selectedComponentId,
  selection,
  geographicRoutes,
  routesActive,
  routesAnimating,
  routesStale,
  regionFailure,
  onSelectComponent,
  onSelectRegion,
  onClearSelection,
}: {
  architecture: Architecture;
  challenge: ChallengeDefinition;
  selectedComponentId: string | null;
  selection: WorldMapSelection;
  geographicRoutes: readonly GeographicRoute[];
  routesActive: boolean;
  /** Completed simulation evidence stays visible without an idle traffic loop. */
  routesAnimating: boolean;
  /** Architecture edits retain, but visibly dim, the last run's route evidence. */
  routesStale: boolean;
  regionFailure?: RegionFailurePresentation | null;
  onSelectComponent: (componentId: string, deploymentId?: string) => void;
  onSelectRegion: (regionId: RegionId) => void;
  onClearSelection: () => void;
}) {
  const regions = getRegions();
  const deployments = useMemo(() => collectDeployments(architecture), [architecture]);
  const enclosureRegions = useMemo(
    () => enclosureRegionsForArchitecture(architecture, challenge),
    [architecture, challenge],
  );

  const trafficByRegion = useMemo(() => {
    const totalRedirect = challenge.workload.requestsPerSecond * challenge.workload.readRatio;
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
          <pattern id="world-dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.75" className="world-map__grid-dot" />
          </pattern>
          <marker id="world-arc-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" className="world-map__arc-arrow" />
          </marker>
        </defs>

        <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="world-map__paper" />
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#world-dot-grid)" />

        <g className="world-map__coastlines" aria-hidden="true">
          {COASTLINE_ELLIPSES.map((coast, index) => (
            <ellipse key={index} cx={coast.cx} cy={coast.cy} rx={coast.rx} ry={coast.ry} />
          ))}
        </g>

        <g className="world-map__enclosures" aria-hidden="true">
          {enclosureRegions.map((regionId) => {
            const bounds = regionEnclosureOnMap(regionId);
            return (
              <rect
                key={regionId}
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                className="world-map__enclosure"
              />
            );
          })}
        </g>

        <g className="world-map__arcs" aria-label={routesActive ? "Simulated traffic arcs" : undefined}>
          {arcs.map((arc) => {
            const strokeWidth = strokeForVolume(arc.rps, maxArcRps);
            const highlighted = arcHighlighted(arc, selection, selectedComponentId);
            const dimmed = anyHighlight && !highlighted;
            const durationMs = arcDurationMs(arc.originRegion, arc.destinationRegion);
            return (
              <path
                key={arc.key}
                className={[
                  "world-map__arc",
                  routesAnimating ? "world-map__arc--flow" : "",
                  routesStale ? "world-map__arc--stale" : "",
                  arc.crossRegion ? "world-map__arc--cross" : "world-map__arc--local",
                  highlighted ? "world-map__arc--highlighted" : "",
                  dimmed ? "world-map__arc--dimmed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                d={arcPath(arc.originRegion, arc.destinationRegion, arc.kind)}
                pathLength={100}
                style={{
                  strokeWidth,
                  ["--arc-duration" as string]: `${durationMs}ms`,
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
          const isOrigin = Boolean(traffic);
          const selected = selection?.kind === "region" && selection.regionId === region.id;
          const healthy = region.health === "healthy";
          const simulatedFailed = regionFailure?.failedRegionIds.includes(region.id) ?? false;
          const databaseUnavailable = regionFailure?.databaseUnavailableRegionIds.includes(region.id) ?? false;

          return (
            <g
              key={region.id}
              className={[
                "world-map__region",
                selected ? "world-map__region--selected" : "",
                isOrigin ? "world-map__region--origin" : "",
                healthy ? "" : "world-map__region--unhealthy",
                simulatedFailed ? "world-map__region--simulated-failed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              transform={`translate(${point.cx} ${point.cy})`}
            >
              <circle className="world-map__region-hit" r={48} onClick={() => onSelectRegion(region.id)} />
              {isOrigin ? <circle className="world-map__region-origin-ring" r={14} /> : null}
              <circle className="world-map__region-dot" r={isOrigin ? 5 : 4} />
              <text className="world-map__region-label" y={-22} textAnchor="middle">
                {region.label}
              </text>
              {traffic ? (
                <text
                  className="world-map__region-traffic tabular"
                  y={32}
                  textAnchor="middle"
                  aria-label={`Challenge origin share ${Math.round(traffic.fraction * 100)} percent`}
                >
                  {Math.round(traffic.fraction * 100)}% origin · {Math.round(traffic.redirectRps).toLocaleString("en-US")} rps
                </text>
              ) : null}
              {simulatedFailed ? (
                <text className="world-map__region-failure" y={traffic ? 46 : 32} textAnchor="middle">
                  {databaseUnavailable ? "SIMULATED DB UNAVAILABLE" : "SIMULATED UNAVAILABLE"}
                </text>
              ) : null}
            </g>
          );
        })}

        {deployments.map((marker) => {
          const region = getRegion(marker.regionId);
          const point = toMapPoint(region.coordinates.x, region.coordinates.y);
          const stackOffset = marker.offsetIndex * 28;
          const selected =
            selectedComponentId === marker.componentId ||
            (selection?.kind === "deployment" &&
              selection.componentId === marker.componentId &&
              selection.deploymentId === marker.deploymentId);
          const unavailable =
            (regionFailure?.failedRegionIds.includes(marker.regionId) ?? false) ||
            (regionFailure?.failedComponentIds.includes(marker.componentId) ?? false);

          return (
            <g
              key={marker.key}
              className={["world-map__deployment", selected ? "world-map__deployment--selected" : "", unavailable ? "world-map__deployment--unavailable" : ""]
                .filter(Boolean)
                .join(" ")}
              transform={`translate(${point.cx + 40} ${point.cy - 12 + stackOffset})`}
              onClick={() => onSelectComponent(marker.componentId, marker.deploymentId)}
            >
              <rect className="world-map__deployment-hit" x={-4} y={-4} width={32} height={32} />
              <foreignObject x={0} y={0} width={24} height={24}>
                <div className="world-map__deployment-glyph">
                  <WorldMapDeploymentGlyph component={marker.component} selected={selected} unavailable={unavailable} />
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>

      <div className="world-map__legend" aria-label="Map legend">
        <span className="world-map__legend-item">challenge origin share</span>
        <span className="world-map__legend-item">deployment glyph</span>
        {regionFailure ? <span className="world-map__legend-item world-map__legend-item--simulated-failure">simulated unavailable</span> : null}
        {routesActive ? (
          <span className="world-map__legend-item">simulator route · weight = rps</span>
        ) : (
          <span className="world-map__legend-hint">Run simulation to show simulator routes</span>
        )}
        {selection?.kind === "region" ? (
          <button type="button" className="world-map__focus-clear" onClick={onClearSelection}>
            Clear {getRegion(selection.regionId).label} focus
          </button>
        ) : null}
      </div>
    </div>
  );
});
