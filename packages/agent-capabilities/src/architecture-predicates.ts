import {
  isValidRegion,
  postgresReplicaDeployments,
  type Architecture,
  type ComponentInstance,
} from "@faultline/core";

/** True when the architecture includes at least one Redis component. */
export function architectureHasRedis(architecture: Architecture): boolean {
  return architecture.components.some((component) => component.type === "redis");
}

/** True when one Postgres component has replica configuration or deployments. */
export function componentHasPostgresReplica(component: ComponentInstance): boolean {
  if (component.type !== "postgres") return false;
  if (component.deployments.length > 0) {
    return postgresReplicaDeployments(component.deployments).length > 0;
  }
  const readReplicaCount = component.config.readReplicaCount;
  return typeof readReplicaCount === "number" && readReplicaCount > 0;
}

/** True when at least one Postgres component has replica configuration or deployments. */
export function architectureHasPostgresReplica(architecture: Architecture): boolean {
  return architecture.components.some(componentHasPostgresReplica);
}

/** True when valid deployments span at least two distinct known regions. */
export function architectureHasMultiRegionDeployments(architecture: Architecture): boolean {
  const regions = new Set<string>();
  for (const component of architecture.components) {
    for (const deployment of component.deployments) {
      if (isValidRegion(deployment.regionId)) regions.add(deployment.regionId);
    }
  }
  return regions.size >= 2;
}

/** Structural predicate for a Phase 7 dynamic capability name. */
export function phase7DynamicCapabilityPredicate(
  name: string,
  architecture: Architecture,
): boolean {
  switch (name) {
    case "inspect_cache":
      return architectureHasRedis(architecture);
    case "inspect_replication":
      return architectureHasPostgresReplica(architecture);
    case "inspect_regional_traffic":
      return architectureHasMultiRegionDeployments(architecture);
    case "inspect_queue":
      return architecture.components.some((component) => component.type === "queue");
    case "inspect_processing":
      return architecture.components.some((component) => component.type === "worker");
    case "inspect_object_storage":
      return architecture.components.some((component) => component.type === "object-storage");
    case "inspect_playback_origin":
      return architecture.components.some((component) => component.type === "cdn" || component.type === "object-storage");
    default:
      return false;
  }
}

/** Minimal canonical facts that drive dynamic capability availability. */
export function architectureAvailabilityFingerprint(architecture: Architecture): string {
  // This is an input fingerprint, not the final resolver output. It includes
  // every non-presentation architecture fact an availability predicate may
  // inspect, so callers can safely recompute a resolver fingerprint without
  // reacting to node movement.
  return JSON.stringify({
    version: architecture.version,
    components: architecture.components.map(({ id, type, config, deployments }) => ({
      id,
      type,
      config,
      deployments,
    })),
    connections: architecture.connections,
  });
}
