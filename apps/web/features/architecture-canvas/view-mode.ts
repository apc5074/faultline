/**
 * Presentation helpers for Logical | World views.
 * View mode is UI-only — never part of simulator input or Architecture persistence.
 */

import {
  postgresPrimaryDeployment,
  postgresReplicaDeployments,
  totalServiceInstancesFromDeployments,
  type ComponentInstance,
} from "@faultline/core";

export type ArchitectureViewMode = "logical" | "world";

/** Compact capacity / placement line for logical canvas nodes. */
export function logicalCapacitySummary(component: ComponentInstance): string | null {
  if (component.type === "service") {
    const instances =
      component.deployments.length > 0
        ? totalServiceInstancesFromDeployments(component.deployments)
        : typeof component.config.instances === "number"
          ? component.config.instances
          : null;
    if (instances === null) return null;
    const regions = component.deployments.length;
    if (regions > 0) {
      return `${instances} instances · ${regions} region${regions === 1 ? "" : "s"}`;
    }
    return `${instances} instance${instances === 1 ? "" : "s"}`;
  }

  if (component.type === "postgres") {
    if (component.deployments.length === 0) {
      const replicas =
        typeof component.config.readReplicaCount === "number" ? component.config.readReplicaCount : 0;
      return replicas > 0 ? `Primary · ${replicas} replica${replicas === 1 ? "" : "s"}` : "Primary";
    }
    const primary = postgresPrimaryDeployment(component.deployments);
    const replicas = postgresReplicaDeployments(component.deployments);
    const primaryLabel = primary ? primary.regionId : "primary";
    if (replicas.length === 0) return `Primary · ${primaryLabel}`;
    return `Primary · ${primaryLabel} · ${replicas.length} replica${replicas.length === 1 ? "" : "s"}`;
  }

  if (component.type === "redis") {
    const regions = component.deployments.length;
    if (regions === 0) return "Logical cache";
    return `${regions} region${regions === 1 ? "" : "s"}`;
  }

  return null;
}
