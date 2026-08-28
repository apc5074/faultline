/** JSON values permitted in canonical architecture state. */
export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Presentation-only state. It must never influence simulation outcomes. */
export interface ComponentUIState {
  x: number;
  y: number;
}

/**
 * Regional placement of a logical component instance.
 * Deployments live on the same Architecture — never a second world model.
 * `regionId` must resolve through the region registry when geography is active.
 *
 * Component-specific `config` examples:
 * - service: `{ instances: number }`
 * - redis: `{}` (one independent regional cache footprint)
 * - postgres: `{ role: "primary" | "replica" }`
 */
export interface RegionDeployment {
  /** Stable identity within the component's deployments list. */
  id: string;
  regionId: string;
  config: JsonObject;
}

export type PostgresDeploymentRole = "primary" | "replica";

export interface ComponentInstance {
  /** Stable identity, never derived from an array index. */
  id: string;
  type: string;
  config: JsonObject;
  deployments: RegionDeployment[];
  ui: ComponentUIState;
}

/** Supported semantic edge types for architecture connections. */
export const supportedConnectionTypes = ["request", "read_write", "object_io", "async_work"] as const;
export type ConnectionType = (typeof supportedConnectionTypes)[number];

export interface Connection {
  /** Stable identity, never derived from an array index. */
  id: string;
  sourceComponentId: string;
  sourcePortId: string;
  targetComponentId: string;
  targetPortId: string;
  type: ConnectionType;
}

/** Domain metadata from which a future canvas can derive typed handles. */
export interface PortDefinition {
  id: string;
  label: string;
  direction: "input" | "output";
  connectionTypes: readonly ConnectionType[];
}

export type ConnectionCompatibilityResult =
  | { valid: true; connectionType: ConnectionType }
  | { valid: false; code: "SOURCE_NOT_OUTPUT" | "TARGET_NOT_INPUT" | "UNSUPPORTED_CONNECTION_TYPE"; message: string };

/**
 * Checks a proposed semantic connection entirely in the domain layer.
 * Component definitions supply the ports; UI adapters only render their result.
 */
export function checkConnectionCompatibility(
  sourcePort: PortDefinition,
  targetPort: PortDefinition,
  connectionType: ConnectionType,
): ConnectionCompatibilityResult {
  if (sourcePort.direction !== "output") {
    return { valid: false, code: "SOURCE_NOT_OUTPUT", message: `Source port "${sourcePort.id}" must be an output port.` };
  }
  if (targetPort.direction !== "input") {
    return { valid: false, code: "TARGET_NOT_INPUT", message: `Target port "${targetPort.id}" must be an input port.` };
  }
  if (!sourcePort.connectionTypes.includes(connectionType) || !targetPort.connectionTypes.includes(connectionType)) {
    return {
      valid: false,
      code: "UNSUPPORTED_CONNECTION_TYPE",
      message: `Ports "${sourcePort.id}" and "${targetPort.id}" do not both support "${connectionType}" connections.`,
    };
  }
  return { valid: true, connectionType };
}

/** The one serializable architecture representation used by every adapter. */
export interface Architecture {
  version: 1;
  components: ComponentInstance[];
  connections: Connection[];
}

export type ArchitectureValidationCode =
  | "INVALID_ARCHITECTURE"
  | "INVALID_COMPONENT"
  | "INVALID_CONNECTION"
  | "DUPLICATE_COMPONENT_ID"
  | "DUPLICATE_CONNECTION_ID"
  | "UNSUPPORTED_ARCHITECTURE_VERSION";

export interface ArchitectureValidationIssue {
  code: ArchitectureValidationCode;
  message: string;
  path: string;
}

export type ArchitectureValidationResult =
  | { success: true; data: Architecture }
  | { success: false; errors: ArchitectureValidationIssue[] };

const connectionTypes = new Set<ConnectionType>(supportedConnectionTypes);

export function isConnectionType(value: unknown): value is ConnectionType {
  return typeof value === "string" && connectionTypes.has(value as ConnectionType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function issue(
  errors: ArchitectureValidationIssue[],
  code: ArchitectureValidationCode,
  message: string,
  path: string,
): void {
  errors.push({ code, message, path });
}

function validateComponent(
  value: unknown,
  index: number,
  errors: ArchitectureValidationIssue[],
): value is ComponentInstance {
  const path = `components[${index}]`;
  if (!isRecord(value)) {
    issue(errors, "INVALID_COMPONENT", "Component must be an object.", path);
    return false;
  }

  let valid = true;
  if (!isNonEmptyString(value.id)) {
    issue(errors, "INVALID_COMPONENT", "Component id must be a non-empty string.", `${path}.id`);
    valid = false;
  }
  if (!isNonEmptyString(value.type)) {
    issue(errors, "INVALID_COMPONENT", "Component type must be a non-empty string.", `${path}.type`);
    valid = false;
  }
  if (!isRecord(value.config) || !isJsonValue(value.config)) {
    issue(errors, "INVALID_COMPONENT", "Component config must be a serializable object.", `${path}.config`);
    valid = false;
  }
  if (!Array.isArray(value.deployments) || !value.deployments.every(isRegionDeployment)) {
    issue(errors, "INVALID_COMPONENT", "Deployments must be serializable region deployments.", `${path}.deployments`);
    valid = false;
  }
  if (!isComponentUIState(value.ui)) {
    issue(errors, "INVALID_COMPONENT", "Component ui must contain finite x and y coordinates.", `${path}.ui`);
    valid = false;
  }
  return valid;
}

function isRegionDeployment(value: unknown): value is RegionDeployment {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.regionId) &&
    isRecord(value.config) &&
    isJsonValue(value.config)
  );
}

function isComponentUIState(value: unknown): value is ComponentUIState {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function validateConnection(
  value: unknown,
  index: number,
  errors: ArchitectureValidationIssue[],
): value is Connection {
  const path = `connections[${index}]`;
  if (!isRecord(value)) {
    issue(errors, "INVALID_CONNECTION", "Connection must be an object.", path);
    return false;
  }

  const stringFields = ["id", "sourceComponentId", "sourcePortId", "targetComponentId", "targetPortId"] as const;
  let valid = true;
  for (const field of stringFields) {
    if (!isNonEmptyString(value[field])) {
      issue(errors, "INVALID_CONNECTION", `Connection ${field} must be a non-empty string.`, `${path}.${field}`);
      valid = false;
    }
  }
  if (!isConnectionType(value.type)) {
    issue(errors, "INVALID_CONNECTION", "Connection type must be a supported semantic type.", `${path}.type`);
    valid = false;
  }
  return valid;
}

/**
 * Validates untrusted architecture-shaped data at the package boundary.
 * Graph and port compatibility are intentionally added by later core/simulator tickets.
 */
export function validateArchitecture(input: unknown): ArchitectureValidationResult {
  const errors: ArchitectureValidationIssue[] = [];
  if (!isRecord(input)) {
    return { success: false, errors: [{ code: "INVALID_ARCHITECTURE", message: "Architecture must be an object.", path: "architecture" }] };
  }

  if (input.version !== 1) {
    issue(errors, "UNSUPPORTED_ARCHITECTURE_VERSION", "Architecture version must be 1.", "version");
  }
  if (!Array.isArray(input.components)) {
    issue(errors, "INVALID_ARCHITECTURE", "Architecture components must be an array.", "components");
  }
  if (!Array.isArray(input.connections)) {
    issue(errors, "INVALID_ARCHITECTURE", "Architecture connections must be an array.", "connections");
  }

  const components = Array.isArray(input.components) ? input.components : [];
  const connections = Array.isArray(input.connections) ? input.connections : [];
  const componentIds = new Set<string>();
  const connectionIds = new Set<string>();

  components.forEach((component, index) => {
    if (validateComponent(component, index, errors) && componentIds.has(component.id)) {
      issue(errors, "DUPLICATE_COMPONENT_ID", `Component id "${component.id}" is duplicated.`, `components[${index}].id`);
    } else if (isRecord(component) && isNonEmptyString(component.id)) {
      componentIds.add(component.id);
    }
  });
  connections.forEach((connection, index) => {
    if (validateConnection(connection, index, errors) && connectionIds.has(connection.id)) {
      issue(errors, "DUPLICATE_CONNECTION_ID", `Connection id "${connection.id}" is duplicated.`, `connections[${index}].id`);
    } else if (isRecord(connection) && isNonEmptyString(connection.id)) {
      connectionIds.add(connection.id);
    }
  });

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: input as unknown as Architecture };
}

/** Returns validated canonical data or an Error suitable for an input boundary. */
export function parseArchitecture(input: unknown): Architecture {
  const result = validateArchitecture(input);
  if (!result.success) {
    throw new Error(result.errors.map(({ path, message }) => `${path}: ${message}`).join(" "));
  }
  return result.data;
}
