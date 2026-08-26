/**
 * Canonical region registry for Faultline geography.
 *
 * Educational constants only — no external map/latency services.
 * Latency matrices and transfer rates live in separate modules.
 */

export const regionIds = [
  "us-east",
  "us-west",
  "europe",
  "india",
  "singapore",
  "tokyo",
] as const;

export type RegionId = (typeof regionIds)[number];

export type RegionHealth = "healthy" | "unhealthy";

/** Normalized SVG/world-map placement (0..1). Not GIS precision. */
export interface RegionCoordinates {
  x: number;
  y: number;
}

export interface RegionDefinition {
  id: RegionId;
  label: string;
  coordinates: RegionCoordinates;
  /** Phase 3 play keeps every registry region healthy. */
  health: RegionHealth;
}

export class UnknownRegionError extends Error {
  override name = "UnknownRegionError";

  constructor(regionId: string) {
    super(`Unknown region "${regionId}". Valid regions: ${regionIds.join(", ")}.`);
  }
}

/**
 * Fixed educational layout for the Phase 3 world map.
 * Positions approximate relative placement on a normalized equirectangular plane.
 */
const REGION_DEFINITIONS: readonly RegionDefinition[] = [
  { id: "us-east", label: "US East", coordinates: { x: 0.25, y: 0.38 }, health: "healthy" },
  { id: "us-west", label: "US West", coordinates: { x: 0.14, y: 0.4 }, health: "healthy" },
  { id: "europe", label: "Europe", coordinates: { x: 0.5, y: 0.3 }, health: "healthy" },
  { id: "india", label: "India", coordinates: { x: 0.68, y: 0.48 }, health: "healthy" },
  { id: "singapore", label: "Singapore", coordinates: { x: 0.76, y: 0.58 }, health: "healthy" },
  { id: "tokyo", label: "Tokyo", coordinates: { x: 0.84, y: 0.38 }, health: "healthy" },
];

const regionsById = new Map<RegionId, RegionDefinition>(
  REGION_DEFINITIONS.map((region) => [region.id, region]),
);

export function isValidRegion(id: unknown): id is RegionId {
  return typeof id === "string" && regionsById.has(id as RegionId);
}

/** Returns every registered region in stable source order. */
export function getRegions(): readonly RegionDefinition[] {
  return REGION_DEFINITIONS;
}

/**
 * Looks up a region by stable machine ID.
 * @throws {UnknownRegionError} when the id is not in the registry
 */
export function getRegion(id: string): RegionDefinition {
  if (!isValidRegion(id)) {
    throw new UnknownRegionError(id);
  }
  return regionsById.get(id)!;
}
