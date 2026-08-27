import {
  isConnectionType,
  componentPresentationSizes,
  componentPresentationStates,
  type ComponentDefinition,
  type ComponentPresentationBinding,
  type JsonObject,
  type MetricDefinition,
  type PortDefinition,
} from "@faultline/core";

const stableTypePattern = /^[a-z][a-z0-9-]*$/;

export class ComponentDefinitionError extends Error {
  override name = "ComponentDefinitionError";
}

export class DuplicateComponentTypeError extends Error {
  override name = "DuplicateComponentTypeError";
}

export class UnknownComponentTypeError extends Error {
  override name = "UnknownComponentTypeError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && Object.values(value).every(isJsonValue);
}

function isPresentationBinding(value: unknown): value is ComponentPresentationBinding {
  return (
    isRecord(value) &&
    isNonEmptyString(value.name) &&
    (value.source === "config" || value.source === "deployment") &&
    isNonEmptyString(value.path)
  );
}

function assertPresentationDescriptor(definition: Record<string, unknown>): void {
  const presentation = definition.presentation;
  if (!isRecord(presentation)) {
    throw new ComponentDefinitionError(`Component "${String(definition.type)}" requires a presentation descriptor.`);
  }
  if (!isNonEmptyString(presentation.glyph) || !/^[a-z][a-z0-9_]*$/.test(presentation.glyph)) {
    throw new ComponentDefinitionError(`Component "${String(definition.type)}" presentation glyph must be a stable identifier.`);
  }
  if (!componentPresentationSizes.includes(presentation.size as (typeof componentPresentationSizes)[number])) {
    throw new ComponentDefinitionError(`Component "${String(definition.type)}" presentation size is invalid.`);
  }
  if (!Array.isArray(presentation.visualConfig) || !presentation.visualConfig.every(isPresentationBinding)) {
    throw new ComponentDefinitionError(`Component "${String(definition.type)}" presentation visualConfig is invalid.`);
  }
  const bindingNames = presentation.visualConfig.map((binding) => binding.name);
  if (new Set(bindingNames).size !== bindingNames.length) {
    throw new ComponentDefinitionError(`Component "${String(definition.type)}" presentation has duplicate binding names.`);
  }
  if (!Array.isArray(presentation.supportedStates) || presentation.supportedStates.length === 0) {
    throw new ComponentDefinitionError(`Component "${String(definition.type)}" presentation supportedStates is invalid.`);
  }
  if (
    !presentation.supportedStates.every((state) =>
      componentPresentationStates.includes(state as (typeof componentPresentationStates)[number]),
    )
  ) {
    throw new ComponentDefinitionError(`Component "${String(definition.type)}" presentation supportedStates is invalid.`);
  }
  if (new Set(presentation.supportedStates).size !== presentation.supportedStates.length) {
    throw new ComponentDefinitionError(`Component "${String(definition.type)}" presentation has duplicate states.`);
  }
  if (!isJsonValue(presentation)) {
    throw new ComponentDefinitionError(`Component "${String(definition.type)}" presentation must be serializable metadata.`);
  }
}

function isPortDefinition(value: unknown): value is PortDefinition {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.label) &&
    (value.direction === "input" || value.direction === "output") &&
    Array.isArray(value.connectionTypes) &&
    value.connectionTypes.length > 0 &&
    value.connectionTypes.every(isConnectionType)
  );
}

function isMetricDefinition(value: unknown): value is MetricDefinition {
  return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.label) && isNonEmptyString(value.unit);
}

/** Throws a useful error instead of allowing an incomplete definition into the catalog. */
export function assertComponentDefinition(definition: unknown): asserts definition is ComponentDefinition {
  if (!isRecord(definition)) throw new ComponentDefinitionError("Component definition must be an object.");
  if (!isNonEmptyString(definition.type) || !stableTypePattern.test(definition.type)) {
    throw new ComponentDefinitionError("Component type must be a stable lowercase hyphenated identifier.");
  }
  if (!isNonEmptyString(definition.label) || !isNonEmptyString(definition.category)) {
    throw new ComponentDefinitionError(`Component "${definition.type}" must have a label and category.`);
  }
  if (!isJsonObject(definition.defaultConfig)) {
    throw new ComponentDefinitionError(`Component "${definition.type}" defaultConfig must be a serializable object.`);
  }
  if (!isRecord(definition.configSchema) || typeof definition.configSchema.safeParse !== "function") {
    throw new ComponentDefinitionError(`Component "${definition.type}" requires a configSchema.safeParse function.`);
  }
  const configResult = (definition.configSchema.safeParse as (input: unknown) => unknown)(definition.defaultConfig);
  if (!isRecord(configResult) || configResult.success !== true) {
    throw new ComponentDefinitionError(`Component "${definition.type}" defaultConfig does not satisfy its config schema.`);
  }
  if (!Array.isArray(definition.ports) || !definition.ports.every(isPortDefinition)) {
    throw new ComponentDefinitionError(`Component "${definition.type}" has an invalid port definition.`);
  }
  const portIds = definition.ports.map((port) => port.id);
  if (new Set(portIds).size !== portIds.length) {
    throw new ComponentDefinitionError(`Component "${definition.type}" has duplicate port IDs.`);
  }
  if (!Array.isArray(definition.metrics) || !definition.metrics.every(isMetricDefinition)) {
    throw new ComponentDefinitionError(`Component "${definition.type}" has an invalid metric definition.`);
  }
  assertPresentationDescriptor(definition);
  const metricIds = definition.metrics.map((metric) => metric.id);
  if (new Set(metricIds).size !== metricIds.length) {
    throw new ComponentDefinitionError(`Component "${definition.type}" has duplicate metric IDs.`);
  }
  if (typeof definition.schemaVersion !== "number" || !Number.isInteger(definition.schemaVersion) || definition.schemaVersion < 1) {
    throw new ComponentDefinitionError(`Component "${definition.type}" schemaVersion must be a positive integer.`);
  }
  for (const flag of ["regionSupport", "replicationSupport", "clusteringSupport"] as const) {
    if (typeof definition[flag] !== "boolean") {
      throw new ComponentDefinitionError(`Component "${definition.type}" ${flag} must be boolean.`);
    }
  }
  if (!Array.isArray(definition.agentCapabilities) || !definition.agentCapabilities.every(isNonEmptyString)) {
    throw new ComponentDefinitionError(`Component "${definition.type}" has invalid agent capability metadata.`);
  }
  for (const optionalCharacteristic of ["simulation", "cost"] as const) {
    if (definition[optionalCharacteristic] !== undefined && !isJsonObject(definition[optionalCharacteristic])) {
      throw new ComponentDefinitionError(`Component "${definition.type}" ${optionalCharacteristic} must be serializable metadata.`);
    }
  }
}

/** The single registration surface used by the UI, validation, and simulator. */
export class ComponentRegistry {
  readonly #definitions = new Map<string, ComponentDefinition>();

  register(definition: ComponentDefinition): void {
    assertComponentDefinition(definition);
    if (this.#definitions.has(definition.type)) {
      throw new DuplicateComponentTypeError(`Component type "${definition.type}" is already registered.`);
    }
    this.#definitions.set(definition.type, definition);
  }

  get(type: string): ComponentDefinition {
    const definition = this.#definitions.get(type);
    if (!definition) throw new UnknownComponentTypeError(`Unknown component type "${type}".`);
    return definition;
  }

  has(type: string): boolean {
    return this.#definitions.has(type);
  }

  list(): readonly ComponentDefinition[] {
    return [...this.#definitions.values()];
  }
}

export function createComponentRegistry(definitions: readonly ComponentDefinition[] = []): ComponentRegistry {
  const registry = new ComponentRegistry();
  for (const definition of definitions) registry.register(definition);
  return registry;
}
