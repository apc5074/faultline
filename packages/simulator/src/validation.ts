import { ComponentRegistry } from "@faultline/component-catalog";
import {
  checkConnectionCompatibility,
  validateArchitecture,
  type Architecture,
  type ChallengeDefinition,
  type ComponentInstance,
} from "@faultline/core";

import { validateComponentDeployments } from "./deployments.js";

export type SimulationValidationErrorCode =
  | "ARCHITECTURE_SCHEMA_INVALID"
  | "UNKNOWN_COMPONENT_TYPE"
  | "INVALID_COMPONENT_CONFIG"
  | "DISALLOWED_COMPONENT_TYPE"
  | "MISSING_CONNECTION_COMPONENT"
  | "SELF_CONNECTION"
  | "UNKNOWN_PORT"
  | "INCOMPATIBLE_CONNECTION"
  | "MISSING_TRAFFIC_SOURCE"
  | "MISSING_REQUEST_PATH"
  | "INVALID_REGIONAL_DEPLOYMENT"
  | "UNSUPPORTED_REGIONAL_DEPLOYMENT"
  | "UNKNOWN_REGION"
  | "DEPLOYMENT_CAPACITY_MISMATCH";

export interface SimulationValidationError {
  code: SimulationValidationErrorCode;
  message: string;
  componentId?: string;
  connectionId?: string;
}

export type SimulationValidationResult =
  | { valid: true; architecture: Architecture }
  | { valid: false; errors: readonly SimulationValidationError[] };

export interface ArchitectureValidationInput {
  architecture: unknown;
  challenge: ChallengeDefinition;
  registry: ComponentRegistry;
}

function error(
  errors: SimulationValidationError[],
  issue: SimulationValidationError,
): void {
  errors.push(issue);
}

function hasViableRequestPath(architecture: Architecture): boolean {
  const componentsById = new Map(architecture.components.map((component) => [component.id, component]));
  const sources = architecture.components.filter((component) => component.type === "traffic-source");
  const requestEdges = architecture.connections.filter((connection) => connection.type === "request");

  for (const source of sources) {
    const visited = new Set([source.id]);
    const pending = [source.id];
    while (pending.length > 0) {
      const currentId = pending.shift();
      if (!currentId) continue;
      for (const edge of requestEdges) {
        if (edge.sourceComponentId !== currentId || visited.has(edge.targetComponentId)) continue;
        const target = componentsById.get(edge.targetComponentId);
        if (!target) continue;
        if (target.type !== "traffic-source") return true;
        visited.add(target.id);
        pending.push(target.id);
      }
    }
  }
  return false;
}

/**
 * Rejects invalid player architecture before any simulation work begins.
 * It validates outcomes-independent graph facts only; traffic is introduced by SIM-002.
 */
export function validateArchitectureForSimulation({
  architecture: input,
  challenge,
  registry,
}: ArchitectureValidationInput): SimulationValidationResult {
  const schemaResult = validateArchitecture(input);
  if (!schemaResult.success) {
    return {
      valid: false,
      errors: schemaResult.errors.map(({ message, path }) => ({
        code: "ARCHITECTURE_SCHEMA_INVALID" as const,
        message: `${path}: ${message}`,
      })),
    };
  }

  const architecture = schemaResult.data;
  const errors: SimulationValidationError[] = [];
  const componentsById = new Map<string, ComponentInstance>();
  const allowedTypes = new Set(challenge.allowedComponentTypes);

  for (const component of architecture.components) {
    componentsById.set(component.id, component);
    if (!registry.has(component.type)) {
      error(errors, { code: "UNKNOWN_COMPONENT_TYPE", message: `Component "${component.id}" uses unknown type "${component.type}".`, componentId: component.id });
      continue;
    }
    if (!allowedTypes.has(component.type)) {
      error(errors, { code: "DISALLOWED_COMPONENT_TYPE", message: `Component type "${component.type}" is not allowed by ${challenge.title}.`, componentId: component.id });
    }
    const definition = registry.get(component.type);
    if (!definition.configSchema.safeParse(component.config).success) {
      error(errors, { code: "INVALID_COMPONENT_CONFIG", message: `Component "${component.id}" has invalid ${definition.label} configuration.`, componentId: component.id });
    }
    validateComponentDeployments(component, registry, errors);
  }

  for (const connection of architecture.connections) {
    const source = componentsById.get(connection.sourceComponentId);
    const target = componentsById.get(connection.targetComponentId);
    if (!source || !target) {
      error(errors, { code: "MISSING_CONNECTION_COMPONENT", message: `Connection "${connection.id}" references a missing component.`, connectionId: connection.id });
      continue;
    }
    if (source.id === target.id) {
      error(errors, { code: "SELF_CONNECTION", message: `Connection "${connection.id}" cannot connect a component to itself.`, componentId: source.id, connectionId: connection.id });
      continue;
    }
    if (!registry.has(source.type) || !registry.has(target.type)) continue;
    const sourcePort = registry.get(source.type).ports.find((port) => port.id === connection.sourcePortId);
    const targetPort = registry.get(target.type).ports.find((port) => port.id === connection.targetPortId);
    if (!sourcePort || !targetPort) {
      error(errors, { code: "UNKNOWN_PORT", message: `Connection "${connection.id}" references an unknown component port.`, connectionId: connection.id });
      continue;
    }
    const compatibility = checkConnectionCompatibility(sourcePort, targetPort, connection.type);
    if (!compatibility.valid) {
      error(errors, { code: "INCOMPATIBLE_CONNECTION", message: compatibility.message, connectionId: connection.id });
    }
  }

  if (!architecture.components.some((component) => component.type === "traffic-source")) {
    error(errors, { code: "MISSING_TRAFFIC_SOURCE", message: "Add a Traffic Source before running the simulation." });
  } else if (!hasViableRequestPath(architecture)) {
    error(errors, { code: "MISSING_REQUEST_PATH", message: "Connect the Traffic Source to a request-consuming component before running the simulation." });
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true, architecture };
}
