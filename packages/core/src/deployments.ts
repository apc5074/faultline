/**
 * Helpers for reading regional deployment capacity from canonical Architecture state.
 * Preferred Phase 3 model: when deployments are present, they are the physical capacity source;
 * logical config totals must match.
 */

import type { JsonObject, PostgresDeploymentRole, RegionDeployment } from "./architecture.js";
import type { RegionId } from "./region.js";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isPostgresDeploymentRole(value: unknown): value is PostgresDeploymentRole {
  return value === "primary" || value === "replica";
}

/** Service regional instance count from a deployment config. */
export function serviceInstancesFromDeployment(deployment: RegionDeployment): number | null {
  const instances = deployment.config.instances;
  return isPositiveInteger(instances) ? instances : null;
}

export function totalServiceInstancesFromDeployments(deployments: readonly RegionDeployment[]): number {
  return deployments.reduce((sum, deployment) => sum + (serviceInstancesFromDeployment(deployment) ?? 0), 0);
}

export function postgresRoleFromDeployment(deployment: RegionDeployment): PostgresDeploymentRole | null {
  return isPostgresDeploymentRole(deployment.config.role) ? deployment.config.role : null;
}

export function postgresPrimaryDeployment(
  deployments: readonly RegionDeployment[],
): RegionDeployment | undefined {
  return deployments.find((deployment) => postgresRoleFromDeployment(deployment) === "primary");
}

export function postgresReplicaDeployments(
  deployments: readonly RegionDeployment[],
): readonly RegionDeployment[] {
  return deployments.filter((deployment) => postgresRoleFromDeployment(deployment) === "replica");
}

export function createRegionDeployment(
  regionId: RegionId,
  config: JsonObject = {},
  id?: string,
): RegionDeployment {
  const role = typeof config.role === "string" ? config.role : "placement";
  return {
    id: id ?? `dep-${regionId}-${role}`,
    regionId,
    config,
  };
}
