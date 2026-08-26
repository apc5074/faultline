import { serviceCapacityForConfig, type ServiceConfig } from "@faultline/component-catalog";
import type { Architecture } from "@faultline/core";

import {
  propagateTraffic,
  type SimulationEvent,
  type TrafficPropagationInput,
  type TrafficPropagationResult,
} from "./traffic.js";

export type ServiceCapacityState = "healthy" | "warning" | "critical" | "saturated";

export const serviceUtilizationBands = {
  healthyMaximum: 0.7,
  warningMaximum: 0.9,
  criticalMaximum: 1,
} as const;

export interface ServiceCapacityMetrics {
  incomingRps: number;
  capacityRps: number;
  handledRps: number;
  unmetRps: number;
  utilization: number;
  /** May be negative when overloaded so the shortfall remains visible. */
  headroom: number;
  state: ServiceCapacityState;
}

export type ServiceCapacityResult =
  | (Extract<TrafficPropagationResult, { valid: true }> & {
      services: Readonly<Record<string, ServiceCapacityMetrics>>;
    })
  | Extract<TrafficPropagationResult, { valid: false }>;

function stateForUtilization(utilization: number): ServiceCapacityState {
  if (utilization <= serviceUtilizationBands.healthyMaximum) return "healthy";
  if (utilization <= serviceUtilizationBands.warningMaximum) return "warning";
  if (utilization <= serviceUtilizationBands.criticalMaximum) return "critical";
  return "saturated";
}

function capacityEvents(componentId: string, metrics: ServiceCapacityMetrics): SimulationEvent[] {
  const events: SimulationEvent[] = [
    { type: "component_load_changed", componentId, data: { utilization: metrics.utilization, capacityRps: metrics.capacityRps, incomingRps: metrics.incomingRps } },
  ];
  if (metrics.state === "warning" || metrics.state === "critical") {
    events.push({ type: "component_warning", componentId, data: { utilization: metrics.utilization, state: metrics.state } });
  }
  if (metrics.state === "saturated") {
    events.push({ type: "component_saturated", componentId, data: { utilization: metrics.utilization, unmetRps: metrics.unmetRps } });
  }
  return events;
}

/** Applies the centralized Stateless Service capacity model to propagated traffic. */
export function evaluateServiceCapacity(input: TrafficPropagationInput): ServiceCapacityResult {
  const propagation = propagateTraffic(input);
  if (!propagation.valid) return propagation;

  const architecture = input.architecture as Architecture;
  const services: Record<string, ServiceCapacityMetrics> = {};
  const events = [...propagation.events];

  for (const component of [...architecture.components].filter((candidate) => candidate.type === "service").sort((left, right) => left.id.localeCompare(right.id))) {
    const parsed = input.registry.get(component.type).configSchema.safeParse(component.config);
    if (!parsed.success) continue;
    const config = parsed.data as ServiceConfig;
    const incomingRps = propagation.traffic[component.id].incomingRps;
    const capacityRps = serviceCapacityForConfig(config);
    const utilization = incomingRps / capacityRps;
    const metrics: ServiceCapacityMetrics = {
      incomingRps,
      capacityRps,
      handledRps: Math.min(incomingRps, capacityRps),
      unmetRps: Math.max(0, incomingRps - capacityRps),
      utilization,
      headroom: (capacityRps - incomingRps) / capacityRps,
      state: stateForUtilization(utilization),
    };
    services[component.id] = metrics;
    events.push(...capacityEvents(component.id, metrics));
  }

  return { valid: true, traffic: propagation.traffic, caches: propagation.caches, events, services };
}
