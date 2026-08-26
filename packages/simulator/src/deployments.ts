/**
 * Validates ComponentInstance.deployments[] against region registry and component support.
 * Empty deployments remain valid (logical-only / Phase 1–2 compatible).
 */

import type { ComponentRegistry } from "@faultline/component-catalog";
import {
  isValidRegion,
  postgresReplicaDeployments,
  postgresRoleFromDeployment,
  serviceInstancesFromDeployment,
  totalServiceInstancesFromDeployments,
  type ComponentInstance,
} from "@faultline/core";

import type { SimulationValidationError } from "./validation.js";

function pushError(
  errors: SimulationValidationError[],
  issue: SimulationValidationError,
): void {
  errors.push(issue);
}

function assertUniqueDeploymentIds(
  component: ComponentInstance,
  errors: SimulationValidationError[],
): void {
  const seen = new Set<string>();
  for (const deployment of component.deployments) {
    if (seen.has(deployment.id)) {
      pushError(errors, {
        code: "INVALID_REGIONAL_DEPLOYMENT",
        message: `Component "${component.id}" has duplicate deployment id "${deployment.id}".`,
        componentId: component.id,
      });
    }
    seen.add(deployment.id);
  }
}

function assertKnownRegions(component: ComponentInstance, errors: SimulationValidationError[]): void {
  for (const deployment of component.deployments) {
    if (!isValidRegion(deployment.regionId)) {
      pushError(errors, {
        code: "UNKNOWN_REGION",
        message: `Component "${component.id}" deployment "${deployment.id}" references unknown region "${deployment.regionId}".`,
        componentId: component.id,
      });
    }
  }
}

function validateServiceDeployments(component: ComponentInstance, errors: SimulationValidationError[]): void {
  const regionSeen = new Set<string>();
  for (const deployment of component.deployments) {
    if (regionSeen.has(deployment.regionId)) {
      pushError(errors, {
        code: "INVALID_REGIONAL_DEPLOYMENT",
        message: `Service "${component.id}" cannot have multiple deployments in region "${deployment.regionId}".`,
        componentId: component.id,
      });
    }
    regionSeen.add(deployment.regionId);

    if (serviceInstancesFromDeployment(deployment) === null) {
      pushError(errors, {
        code: "INVALID_REGIONAL_DEPLOYMENT",
        message: `Service "${component.id}" deployment "${deployment.id}" requires a positive integer config.instances.`,
        componentId: component.id,
      });
    }
  }

  const configuredInstances = component.config.instances;
  if (typeof configuredInstances !== "number" || !Number.isInteger(configuredInstances)) return;

  const deploymentTotal = totalServiceInstancesFromDeployments(component.deployments);
  if (deploymentTotal !== configuredInstances) {
    pushError(errors, {
      code: "DEPLOYMENT_CAPACITY_MISMATCH",
      message: `Service "${component.id}" logical instances (${configuredInstances}) must equal sum of regional instances (${deploymentTotal}).`,
      componentId: component.id,
    });
  }
}

function validateRedisDeployments(component: ComponentInstance, errors: SimulationValidationError[]): void {
  const regionSeen = new Set<string>();
  for (const deployment of component.deployments) {
    if (regionSeen.has(deployment.regionId)) {
      pushError(errors, {
        code: "INVALID_REGIONAL_DEPLOYMENT",
        message: `Redis "${component.id}" cannot have multiple deployments in region "${deployment.regionId}".`,
        componentId: component.id,
      });
    }
    regionSeen.add(deployment.regionId);
    // Regional Redis is an independent cache footprint. mode:replicated stays local HA, not global sync.
  }
}

function validatePostgresDeployments(component: ComponentInstance, errors: SimulationValidationError[]): void {
  let primaryCount = 0;
  for (const deployment of component.deployments) {
    const role = postgresRoleFromDeployment(deployment);
    if (role === null) {
      pushError(errors, {
        code: "INVALID_REGIONAL_DEPLOYMENT",
        message: `Postgres "${component.id}" deployment "${deployment.id}" requires config.role of "primary" or "replica".`,
        componentId: component.id,
      });
      continue;
    }
    if (role === "primary") primaryCount += 1;
  }

  if (primaryCount === 0) {
    pushError(errors, {
      code: "INVALID_REGIONAL_DEPLOYMENT",
      message: `Postgres "${component.id}" regional deployments require exactly one primary.`,
      componentId: component.id,
    });
  } else if (primaryCount > 1) {
    pushError(errors, {
      code: "INVALID_REGIONAL_DEPLOYMENT",
      message: `Postgres "${component.id}" cannot have multiple primary regions.`,
      componentId: component.id,
    });
  }

  const replicaCount = postgresReplicaDeployments(component.deployments).length;
  const configuredReplicas = component.config.readReplicaCount;
  if (typeof configuredReplicas === "number" && configuredReplicas !== replicaCount) {
    pushError(errors, {
      code: "DEPLOYMENT_CAPACITY_MISMATCH",
      message: `Postgres "${component.id}" readReplicaCount (${configuredReplicas}) must equal regional replica deployments (${replicaCount}).`,
      componentId: component.id,
    });
  }
}

/** Appends regional deployment validation errors for one component. */
export function validateComponentDeployments(
  component: ComponentInstance,
  registry: ComponentRegistry,
  errors: SimulationValidationError[],
): void {
  if (component.deployments.length === 0) return;

  if (!registry.has(component.type)) return;
  const definition = registry.get(component.type);

  if (!definition.regionSupport) {
    pushError(errors, {
      code: "UNSUPPORTED_REGIONAL_DEPLOYMENT",
      message: `Component "${component.id}" (${definition.label}) does not support regional deployments.`,
      componentId: component.id,
    });
    return;
  }

  assertUniqueDeploymentIds(component, errors);
  assertKnownRegions(component, errors);

  if (component.type === "service") validateServiceDeployments(component, errors);
  else if (component.type === "redis") validateRedisDeployments(component, errors);
  else if (component.type === "postgres") validatePostgresDeployments(component, errors);
}
