import type { AgentContext } from "./context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "./result.js";
import type { PinObservationInput } from "./visual-schemas.js";

export interface PinnedObservation {
  readonly target: PinObservationInput["target"];
  readonly id: string;
  readonly metricId: string;
  readonly label: string;
  readonly value: number | string;
  readonly unit: string;
  readonly source: "baseline";
  readonly simulated: false;
}

export interface PinObservationIntent {
  readonly observation: PinnedObservation;
}

function metricUnit(metricId: string): string {
  if (/rate|utilization|headroom|ratio/i.test(metricId)) return "ratio";
  if (/latency|ms/i.test(metricId)) return "ms";
  if (/rps|requests/i.test(metricId)) return "rps";
  return "value";
}

function componentObservation(context: AgentContext, input: PinObservationInput): CapabilityResult<PinObservationIntent> {
  const component = context.architecture.components.find((entry) => entry.id === input.id);
  if (!component) return capabilityError("NOT_FOUND", `Unknown component "${input.id}".`);
  if (input.target === "cache" && component.type !== "redis" && component.type !== "cdn") return capabilityError("INVALID_INPUT", `Component "${input.id}" is not a cache.`);
  const evidence = context.simulation?.available === true ? context.simulation.components[input.id] : undefined;
  if (!evidence) return capabilityError("SIMULATION_UNAVAILABLE", "Current baseline simulation evidence is unavailable for this component.");
  const metricId = input.metricId ?? (typeof evidence.metrics.hitRate === "number" ? "hitRate" : typeof evidence.metrics.effectiveUtilization === "number" ? "effectiveUtilization" : "utilization");
  const value = evidence.metrics[metricId];
  if (typeof value !== "number") return capabilityError("NOT_FOUND", `No authoritative metric "${metricId}" is available for "${input.id}".`);
  return capabilityOk({ observation: { target: input.target, id: input.id, metricId, label: `${input.id} · ${metricId}`, value, unit: metricUnit(metricId), source: "baseline", simulated: false } });
}

export function pinObservation(context: AgentContext, input: PinObservationInput): CapabilityResult<PinObservationIntent> {
  if (input.target === "component" || input.target === "cache") return componentObservation(context, input);
  if (input.target === "requirement") {
    const requirement = context.challenge.requirements.find((entry) => entry.id === input.id);
    if (!requirement) return capabilityError("NOT_FOUND", `Unknown requirement "${input.id}".`);
    const system = context.simulation?.available === true ? context.simulation.system : undefined;
    const metricId = input.metricId ?? requirement.type;
    const value = metricId === "latency" ? system?.redirectP95Ms : metricId === "headroom" ? system?.minimumHeadroom : metricId === "throughput" ? system?.throughputPass === undefined ? undefined : system.throughputPass ? "pass" : "fail" : undefined;
    if (value === undefined) return capabilityError("SIMULATION_UNAVAILABLE", `No authoritative baseline observation is available for "${input.id}".`);
    return capabilityOk({ observation: { target: "requirement", id: input.id, metricId, label: requirement.label, value, unit: requirement.unit, source: "baseline", simulated: false } });
  }
  const origin = context.simulation?.available === true ? context.simulation.regional?.origins?.find((entry) => entry.regionId === input.id) : undefined;
  if (!origin) return capabilityError("NOT_FOUND", `No authoritative regional observation is available for "${input.id}".`);
  const metricId = input.metricId ?? "redirectRps";
  const value = metricId === "redirectRps" ? origin.redirectRps : metricId === "writeRps" ? origin.writeRps : undefined;
  if (value === undefined) return capabilityError("NOT_FOUND", `No authoritative regional metric "${metricId}" is available for "${input.id}".`);
  return capabilityOk({ observation: { target: "region", id: input.id, metricId, label: `${input.id} · ${metricId}`, value, unit: "rps", source: "baseline", simulated: false } });
}
