import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema, optionalComponentIdInputSchema, type OptionalComponentIdInput } from "../schemas.js";

type Level2Kind = "queue" | "worker" | "object-storage";

function componentIds(context: AgentContext, types: readonly string[]): string[] {
  return context.architecture.components.filter((component) => types.includes(component.type)).map((component) => component.id).sort();
}

function inspect(context: AgentContext, input: OptionalComponentIdInput, types: readonly string[], label: string): CapabilityResult<unknown> {
  const candidates = componentIds(context, types);
  const id = input.componentId ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!id) return capabilityError("INVALID_INPUT", `${label} requires componentId when multiple components are present.`);
  if (!candidates.includes(id)) return capabilityError("NOT_FOUND", `Unknown ${label} component "${id}".`);
  if (!context.simulation || context.simulation.available !== true) return capabilityError("SIMULATION_UNAVAILABLE", "Authoritative simulation evidence is unavailable.");
  const evidence = context.simulation.components[id];
  if (!evidence) return capabilityError("SIMULATION_UNAVAILABLE", `No authoritative evidence is available for "${id}".`);
  return capabilityOk({ componentId: id, type: context.architecture.components.find((component) => component.id === id)?.type, metrics: evidence.metrics, state: evidence.state, monthlyCost: context.cost?.lineItems.filter((item) => item.componentId === id).reduce((sum, item) => sum + item.amount, 0) });
}

export const inspectQueueCapability: AgentCapability<AgentContext, OptionalComponentIdInput, CapabilityResult<unknown>> = {
  name: "inspect_queue",
  description: "Inspect authoritative Queue depth, capacity, arrival and drain work, oldest job age, overflow, backlog, deadline evidence, and cost. Queue buffering is not processing capacity.",
  inputSchema: optionalComponentIdInputSchema,
  mode: "read",
  availableWhen: (context) => context.architecture.components.some((component) => component.type === "queue"),
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute: (context, input) => inspect(context, input, ["queue"], "Queue"),
};

export const inspectProcessingCapability: AgentCapability<AgentContext, OptionalComponentIdInput, CapabilityResult<unknown>> = {
  name: "inspect_processing",
  description: "Inspect authoritative Worker processing capacity, completed work, delay, utilization, unmet work, and cost.",
  inputSchema: optionalComponentIdInputSchema,
  mode: "read",
  availableWhen: (context) => context.architecture.components.some((component) => component.type === "worker"),
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute: (context, input) => inspect(context, input, ["worker"], "Worker"),
};

export const inspectObjectStorageCapability: AgentCapability<AgentContext, OptionalComponentIdInput, CapabilityResult<unknown>> = {
  name: "inspect_object_storage",
  description: "Inspect authoritative Object Storage upload writes, origin reads, capacity pressure, stored bytes, unmet I/O, and cost.",
  inputSchema: optionalComponentIdInputSchema,
  mode: "read",
  availableWhen: (context) => context.architecture.components.some((component) => component.type === "object-storage"),
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute: (context, input) => inspect(context, input, ["object-storage"], "Object Storage"),
};

export const inspectPlaybackOriginCapability: AgentCapability<AgentContext, undefined, CapabilityResult<unknown>> = {
  name: "inspect_playback_origin",
  description: "Inspect authoritative premiere playback CDN hits, origin reads, startup latency, and origin pressure.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: (context) => context.architecture.components.some((component) => component.type === "cdn" || component.type === "object-storage"),
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute: (context) => {
    if (!context.simulation || context.simulation.available !== true) return capabilityError("SIMULATION_UNAVAILABLE", "Authoritative simulation evidence is unavailable.");
    return capabilityOk({ playback: context.simulation.scenarios?.playback, components: componentIds(context, ["cdn", "object-storage"]).map((id) => ({ componentId: id, metrics: context.simulation?.available === true ? context.simulation.components[id]?.metrics : undefined })) });
  },
};

export type { Level2Kind };
