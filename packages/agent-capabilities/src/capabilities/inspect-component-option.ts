import { componentRegistry } from "@faultline/component-catalog";
import type { ComponentAgentConfigField, ComponentDefinition } from "@faultline/core";
import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { inspectComponentOptionInputSchema, type InspectComponentOptionInput } from "../schemas.js";

export interface ComponentOptionFacts {
  readonly type: string;
  readonly displayName: string;
  readonly unlocked: true;
  readonly configFields: readonly ComponentAgentConfigField[];
  readonly costInputs: readonly string[];
  readonly modeledBehaviors: readonly string[];
  readonly unmodeledBehaviors: readonly string[];
  readonly compatibleConnectionRoles: readonly string[];
  readonly placementConstraints: readonly string[];
  readonly learningThemes: readonly string[];
}

export interface InspectComponentOptionOutput {
  readonly kind: "component_option" | "component_options";
  readonly options?: readonly ComponentOptionFacts[];
  readonly option?: ComponentOptionFacts;
}

const projectionCache = new Map<string, ReadonlyMap<string, ComponentOptionFacts>>();

function cacheKey(context: AgentContext): string {
  const types = [...context.challenge.allowedComponentTypes].sort();
  const versions = types.map((type) => `${type}:${componentRegistry.get(type).schemaVersion}`);
  return `${context.challenge.slug}:${context.challenge.version}:${versions.join(",")}`;
}

function project(definition: ComponentDefinition): ComponentOptionFacts {
  if (!definition.agentFacts) throw new Error(`Component "${definition.type}" is missing agent facts.`);
  return {
    type: definition.type,
    displayName: definition.label,
    unlocked: true,
    configFields: definition.agentFacts.configFields,
    costInputs: definition.agentFacts.costInputs,
    modeledBehaviors: definition.agentFacts.modeledBehaviors,
    unmodeledBehaviors: definition.agentFacts.unmodeledBehaviors,
    compatibleConnectionRoles: definition.agentFacts.compatibleConnectionRoles,
    placementConstraints: definition.agentFacts.placementConstraints,
    learningThemes: definition.agentFacts.learningThemes,
  };
}

function optionsFor(context: AgentContext): ReadonlyMap<string, ComponentOptionFacts> {
  const key = cacheKey(context);
  const existing = projectionCache.get(key);
  if (existing) return existing;
  const options = new Map<string, ComponentOptionFacts>();
  for (const type of context.challenge.allowedComponentTypes) {
    const definition = componentRegistry.get(type);
    options.set(type, project(definition));
  }
  projectionCache.set(key, options);
  return options;
}

export function inspectComponentOption(context: AgentContext, input: InspectComponentOptionInput): CapabilityResult<InspectComponentOptionOutput> {
  const options = optionsFor(context);
  if (input.type !== undefined) {
    const option = options.get(input.type);
    if (!option) return capabilityError("NOT_FOUND", `Component option "${input.type}" is not unlocked for this challenge.`);
    return capabilityOk({ kind: "component_option", option });
  }
  return capabilityOk({ kind: "component_options", options: [...options.values()] });
}

export const inspectComponentOptionCapability: AgentCapability<AgentContext, InspectComponentOptionInput, CapabilityResult<InspectComponentOptionOutput>> = {
  name: "inspect_component_option",
  description: "Explain one unlocked component option using challenge-scoped catalog facts. Omit type only to list the bounded current options; never simulates or recommends a topology.",
  inputSchema: inspectComponentOptionInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute(context, input) { return inspectComponentOption(context, input); },
};
