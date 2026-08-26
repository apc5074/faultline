import {
  postgresTierModels,
  type PostgresConfig,
  type PostgresTier,
} from "@faultline/component-catalog";
import type { Architecture } from "@faultline/core";

import {
  propagateTraffic,
  type SimulationEvent,
  type TrafficPropagationInput,
  type TrafficPropagationResult,
} from "./traffic.js";

export type PostgresCapacityState = "healthy" | "warning" | "critical" | "saturated";

export interface PostgresCapacityMetrics {
  readRps: number;
  writeRps: number;
  readCapacityRps: number;
  writeCapacityRps: number;
  readUtilization: number;
  writeUtilization: number;
  /** Effective database pressure is the larger of read and write utilization. */
  effectiveUtilization: number;
  readHandledRps: number;
  writeHandledRps: number;
  readCapacityShortfallRps: number;
  writeCapacityShortfallRps: number;
  state: PostgresCapacityState;
}

export type PostgresCapacityResult =
  | (Extract<TrafficPropagationResult, { valid: true }> & {
      postgres: Readonly<Record<string, PostgresCapacityMetrics>>;
    })
  | Extract<TrafficPropagationResult, { valid: false }>;

function stateForUtilization(utilization: number): PostgresCapacityState {
  if (utilization <= 0.7) return "healthy";
  if (utilization <= 0.9) return "warning";
  if (utilization <= 1) return "critical";
  return "saturated";
}

function capacityEvents(componentId: string, metrics: PostgresCapacityMetrics): SimulationEvent[] {
  const events: SimulationEvent[] = [
    {
      type: "component_load_changed",
      componentId,
      data: {
        readRps: metrics.readRps,
        writeRps: metrics.writeRps,
        readUtilization: metrics.readUtilization,
        writeUtilization: metrics.writeUtilization,
        effectiveUtilization: metrics.effectiveUtilization,
      },
    },
  ];
  if (metrics.state === "warning" || metrics.state === "critical") {
    events.push({
      type: "component_warning",
      componentId,
      data: { state: metrics.state, effectiveUtilization: metrics.effectiveUtilization },
    });
  }
  if (metrics.state === "saturated") {
    events.push({
      type: "component_saturated",
      componentId,
      data: {
        readCapacityShortfallRps: metrics.readCapacityShortfallRps,
        writeCapacityShortfallRps: metrics.writeCapacityShortfallRps,
      },
    });
  }
  return events;
}

/** Applies independent Postgres read/write capacity limits to propagated traffic. */
export function evaluatePostgresCapacity(input: TrafficPropagationInput): PostgresCapacityResult {
  const propagation = propagateTraffic(input);
  if (!propagation.valid) return propagation;

  const architecture = input.architecture as Architecture;
  const postgres: Record<string, PostgresCapacityMetrics> = {};
  const events = [...propagation.events];

  for (const component of architecture.components
    .filter((candidate) => candidate.type === "postgres")
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const config = component.config as PostgresConfig;
    const model = postgresTierModels[config.tier as PostgresTier];
    const traffic = propagation.traffic[component.id];
    const readUtilization = traffic.readRps / model.readCapacityRps;
    const writeUtilization = traffic.writeRps / model.writeCapacityRps;
    const effectiveUtilization = Math.max(readUtilization, writeUtilization);
    const metrics: PostgresCapacityMetrics = {
      readRps: traffic.readRps,
      writeRps: traffic.writeRps,
      readCapacityRps: model.readCapacityRps,
      writeCapacityRps: model.writeCapacityRps,
      readUtilization,
      writeUtilization,
      effectiveUtilization,
      readHandledRps: Math.min(traffic.readRps, model.readCapacityRps),
      writeHandledRps: Math.min(traffic.writeRps, model.writeCapacityRps),
      readCapacityShortfallRps: Math.max(0, traffic.readRps - model.readCapacityRps),
      writeCapacityShortfallRps: Math.max(0, traffic.writeRps - model.writeCapacityRps),
      state: stateForUtilization(effectiveUtilization),
    };
    postgres[component.id] = metrics;
    events.push(...capacityEvents(component.id, metrics));
  }

  return { valid: true, traffic: propagation.traffic, events, postgres };
}
