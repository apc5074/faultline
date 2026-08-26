import type { ComponentInstance, JsonObject, RegionDeployment } from "@faultline/core";

import { componentHasPostgresReplica } from "./architecture-predicates.js";
import type { CapabilityErrorCode } from "./result.js";

export type ComponentSelectionResult =
  | { readonly ok: true; readonly component: ComponentInstance }
  | { readonly ok: false; readonly code: CapabilityErrorCode; readonly message: string };

/** Sorted stable list of architecture components matching a type predicate. */
export function componentsOfType(
  components: readonly ComponentInstance[],
  type: string,
): readonly ComponentInstance[] {
  return components.filter((component) => component.type === type).sort((left, right) => left.id.localeCompare(right.id));
}

/** Sorted Postgres components that have at least one replica. */
export function postgresComponentsWithReplicas(
  components: readonly ComponentInstance[],
): readonly ComponentInstance[] {
  return componentsOfType(components, "postgres").filter(componentHasPostgresReplica);
}

/**
 * Resolve an optional componentId against eligible candidates using Phase 7
 * selector semantics.
 */
export function selectComponentById(
  candidates: readonly ComponentInstance[],
  componentId: string | undefined,
  resourceLabel: string,
): ComponentSelectionResult {
  if (componentId !== undefined) {
    const component = candidates.find((candidate) => candidate.id === componentId);
    if (!component) {
      return { ok: false, code: "NOT_FOUND", message: `Unknown ${resourceLabel} "${componentId}".` };
    }
    return { ok: true, component };
  }

  if (candidates.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: `No ${resourceLabel} is available.` };
  }
  if (candidates.length === 1) {
    return { ok: true, component: candidates[0]! };
  }

  return {
    ok: false,
    code: "INVALID_INPUT",
    message: `Multiple ${resourceLabel} components exist; provide componentId.`,
  };
}

export interface CompactDeployment {
  readonly id: string;
  readonly regionId: string;
  readonly config: JsonObject;
}

export function compactDeployments(deployments: readonly RegionDeployment[]): readonly CompactDeployment[] {
  return [...deployments]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((deployment) => ({
      id: deployment.id,
      regionId: deployment.regionId,
      config: deployment.config,
    }));
}
