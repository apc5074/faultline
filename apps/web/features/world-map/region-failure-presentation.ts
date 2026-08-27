import { isValidRegion, type RegionId } from "@faultline/core";

export type RegionFailurePresentation = {
  failedRegionIds: readonly RegionId[];
  failedComponentIds: readonly string[];
  databaseUnavailableRegionIds: readonly RegionId[];
};

type ExperimentEventLike = {
  type: string;
  componentId?: string;
  data: Readonly<Record<string, number | string>>;
};

/** Extract only simulator-emitted region failure identities for map presentation. */
export function regionFailurePresentationFromEvents(
  events: readonly ExperimentEventLike[] | undefined,
): RegionFailurePresentation | null {
  const failedRegions = new Set<RegionId>();
  const failedComponents = new Set<string>();
  const databaseUnavailableRegions = new Set<RegionId>();
  for (const event of events ?? []) {
    const regionId = typeof event.data.regionId === "string"
      ? event.data.regionId
      : typeof event.data.failedRegion === "string"
        ? event.data.failedRegion
        : undefined;
    if (event.type === "region_failed" && regionId && isValidRegion(regionId)) failedRegions.add(regionId);
    if (event.type === "component_failed" && event.componentId) failedComponents.add(event.componentId);
    if (event.type === "database_unavailable" && regionId && isValidRegion(regionId)) {
      databaseUnavailableRegions.add(regionId);
    }
  }
  if (failedRegions.size === 0) return null;
  return {
    failedRegionIds: [...failedRegions],
    failedComponentIds: [...failedComponents],
    databaseUnavailableRegionIds: [...databaseUnavailableRegions],
  };
}
