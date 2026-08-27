import {
  createRegionDeployment,
  getRegion,
  getRegions,
  isValidRegion,
  postgresPrimaryDeployment,
  postgresReplicaDeployments,
  totalServiceInstancesFromDeployments,
  type Architecture,
  type ChallengeDefinition,
  type ComponentInstance,
  type RegionDeployment,
  type RegionId,
} from "@faultline/core";
import { componentRegistry } from "@faultline/component-catalog";

export interface RegionEnclosureBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ENCLOSURE_SIZE = { width: 280, height: 320 };
const ENCLOSURE_ORIGIN = { x: 60, y: 60 };
const ENCLOSURE_GAP = 20;

/** Stable grid slots for the six registry regions on the logical canvas. */
const REGION_GRID: Record<RegionId, { col: number; row: number }> = {
  "us-east": { col: 0, row: 0 },
  "us-west": { col: 1, row: 0 },
  europe: { col: 2, row: 0 },
  india: { col: 0, row: 1 },
  singapore: { col: 1, row: 1 },
  tokyo: { col: 2, row: 1 },
};

const REGION_ORDER: readonly RegionId[] = [
  "us-east",
  "us-west",
  "europe",
  "india",
  "singapore",
  "tokyo",
];

export function architectureHasDeployments(architecture: Architecture): boolean {
  return architecture.components.some((component) => component.deployments.length > 0);
}

export function activeDeploymentRegions(architecture: Architecture): RegionId[] {
  const ids = new Set<RegionId>();
  for (const component of architecture.components) {
    for (const deployment of component.deployments) {
      if (isValidRegion(deployment.regionId)) {
        ids.add(deployment.regionId);
      }
    }
  }
  return REGION_ORDER.filter((regionId) => ids.has(regionId));
}

export function enclosureRegionsForArchitecture(
  architecture: Architecture,
  challenge: ChallengeDefinition,
): RegionId[] {
  if (!architectureHasDeployments(architecture)) return [];

  const fromChallenge =
    challenge.geographicDistribution
      ?.map((entry) => entry.regionId)
      .filter((regionId): regionId is RegionId => isValidRegion(regionId)) ?? [];

  if (fromChallenge.length > 0) {
    const unique = new Set(fromChallenge);
    return REGION_ORDER.filter((regionId) => unique.has(regionId));
  }

  return activeDeploymentRegions(architecture);
}

export function regionEnclosureBounds(regionId: RegionId): RegionEnclosureBounds {
  const slot = REGION_GRID[regionId];
  return {
    x: ENCLOSURE_ORIGIN.x + slot.col * (ENCLOSURE_SIZE.width + ENCLOSURE_GAP),
    y: ENCLOSURE_ORIGIN.y + slot.row * (ENCLOSURE_SIZE.height + ENCLOSURE_GAP),
    width: ENCLOSURE_SIZE.width,
    height: ENCLOSURE_SIZE.height,
  };
}

export function regionAtPoint(
  x: number,
  y: number,
  regionIds: readonly RegionId[],
): RegionId | null {
  for (const regionId of regionIds) {
    const bounds = regionEnclosureBounds(regionId);
    if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
      return regionId;
    }
  }
  return null;
}

export function regionAtNodeCenter(
  position: { x: number; y: number },
  glyphSize: { width: number; height: number },
  regionIds: readonly RegionId[],
): RegionId | null {
  return regionAtPoint(position.x + glyphSize.width / 2, position.y + glyphSize.height / 2, regionIds);
}

export function componentBelongsInEnclosure(
  component: ComponentInstance,
  glyphSize: { width: number; height: number },
  regionIds: readonly RegionId[],
): boolean {
  if (component.deployments.length === 0) return false;
  const regionId = regionAtNodeCenter(component.ui, glyphSize, regionIds);
  if (!regionId) return false;
  return component.deployments.some((deployment) => deployment.regionId === regionId);
}

export function assignComponentToRegion(
  component: ComponentInstance,
  regionId: RegionId,
): ComponentInstance {
  if (!componentRegistry.has(component.type) || !componentRegistry.get(component.type).regionSupport) {
    return component;
  }

  if (component.type === "service") {
    const hasRegion = component.deployments.some((deployment) => deployment.regionId === regionId);
    const nextDeployments = hasRegion
      ? component.deployments
      : [
          ...component.deployments,
          createRegionDeployment(regionId, { instances: 1 }, `dep-${component.id}-${regionId}`),
        ];
    const instances = totalServiceInstancesFromDeployments(nextDeployments);
    const parsed = componentRegistry.get(component.type).configSchema.safeParse({
      ...component.config,
      instances: Math.max(instances, 1),
    });
    return {
      ...component,
      deployments: nextDeployments,
      config: parsed.success ? parsed.data : component.config,
    };
  }

  if (component.type === "redis") {
    if (component.deployments.some((deployment) => deployment.regionId === regionId)) {
      return component;
    }
    return {
      ...component,
      deployments: [
        ...component.deployments,
        createRegionDeployment(regionId, {}, `dep-${component.id}-${regionId}`),
      ],
    };
  }

  if (component.type === "postgres") {
    const primary = postgresPrimaryDeployment(component.deployments);
    if (!primary) {
      return {
        ...component,
        deployments: [
          createRegionDeployment(regionId, { role: "primary" }, `dep-${component.id}-${regionId}-primary`),
        ],
      };
    }

    if (primary.regionId === regionId) return component;
    if (!isValidRegion(primary.regionId)) return component;

    const primaryRegionId = primary.regionId;
    const replicaIds = new Set(
      postgresReplicaDeployments(component.deployments).map((deployment) => deployment.regionId),
    );
    if (replicaIds.has(regionId)) return component;

    replicaIds.add(regionId);
    const nextDeployments = [
      createRegionDeployment(primaryRegionId, { role: "primary" }, `dep-${component.id}-${primaryRegionId}-primary`),
      ...getRegions()
        .filter((region) => replicaIds.has(region.id))
        .map((region) =>
          createRegionDeployment(region.id, { role: "replica" }, `dep-${component.id}-${region.id}-replica`),
        ),
    ];
    const parsed = componentRegistry.get(component.type).configSchema.safeParse({
      ...component.config,
      readReplicaCount: replicaIds.size,
    });
    return {
      ...component,
      deployments: nextDeployments,
      config: parsed.success ? parsed.data : component.config,
    };
  }

  return component;
}

export function applyRegionPlacementFromPosition(
  component: ComponentInstance,
  position: { x: number; y: number },
  glyphSize: { width: number; height: number },
  regionIds: readonly RegionId[],
): ComponentInstance {
  const regionId = regionAtNodeCenter(position, glyphSize, regionIds);
  if (!regionId) return component;
  return assignComponentToRegion(component, regionId);
}

/**
 * Resize service regional deployments so instance counts sum to `targetTotal`
 * (clamped to catalog bounds). Prefers adjusting the busiest existing region.
 */
export function scaleServiceDeploymentsToTotal(
  deployments: readonly RegionDeployment[],
  targetTotal: number,
  componentId: string,
  bounds: { minimum: number; maximum: number } = { minimum: 1, maximum: 10 },
): RegionDeployment[] {
  if (deployments.length === 0) return [];
  const target = Math.min(bounds.maximum, Math.max(bounds.minimum, Math.floor(targetTotal)));
  const ranked = [...deployments].sort(
    (left, right) =>
      totalServiceInstancesFromDeployments([right]) - totalServiceInstancesFromDeployments([left]) ||
      left.regionId.localeCompare(right.regionId),
  );
  const focus = ranked[0];
  if (!isValidRegion(focus.regionId)) return [...deployments];
  const focusRegionId = focus.regionId;
  const others = ranked.slice(1);
  const othersSum = totalServiceInstancesFromDeployments(others);
  if (othersSum >= target) {
    return [
      createRegionDeployment(
        focusRegionId,
        { instances: target },
        focus.id || `dep-${componentId}-${focusRegionId}`,
      ),
    ];
  }
  return [
    createRegionDeployment(
      focusRegionId,
      { instances: target - othersSum },
      focus.id || `dep-${componentId}-${focusRegionId}`,
    ),
    ...others,
  ];
}

/**
 * Seed a logical Service into regional deployments using challenge origin
 * shares. This is a UI convenience only; the simulator remains authoritative.
 */
export function seedServiceDeploymentsByOrigin(
  totalInstances: number,
  componentId: string,
  distribution: ChallengeDefinition["geographicDistribution"],
): RegionDeployment[] {
  const total = Math.min(10, Math.max(1, Math.floor(totalInstances)));
  const shares = (distribution ?? [])
    .filter((entry) => isValidRegion(entry.regionId) && entry.fraction > 0)
    .map((entry) => ({ regionId: entry.regionId as RegionId, exact: total * entry.fraction }));
  if (shares.length === 0) {
    return [createRegionDeployment("us-east", { instances: total }, `dep-${componentId}-us-east`)];
  }

  const counts = shares.map((share) => Math.floor(share.exact));
  let remaining = total - counts.reduce((sum, count) => sum + count, 0);
  const ranked = shares
    .map((share, index) => ({ ...share, index, remainder: share.exact - counts[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.regionId.localeCompare(right.regionId));
  for (let index = 0; index < ranked.length && remaining > 0; index += 1) {
    counts[ranked[index].index] += 1;
    remaining -= 1;
  }

  return shares.flatMap((share, index) =>
    counts[index] > 0
      ? [createRegionDeployment(share.regionId, { instances: counts[index] }, `dep-${componentId}-${share.regionId}`)]
      : [],
  );
}

export function regionEnclosureLabel(regionId: RegionId): string {
  return getRegion(regionId).label;
}
