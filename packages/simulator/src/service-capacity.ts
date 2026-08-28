import {
  serviceCapacityForConfig,
  serviceSizeModels,
  type ServiceConfig,
} from "@faultline/component-catalog";
import { serviceInstancesFromDeployment, type Architecture } from "@faultline/core";

import {
  propagateTraffic,
  type SimulationEvent,
  type TrafficPropagationInput,
  type TrafficPropagationResult,
} from "./traffic.js";
import {
  activeCapacityScale,
  resolveMechanismPlacement,
  type MechanismPlacementEvidence,
} from "./workload-affinity.js";

export type ServiceCapacityState = "healthy" | "warning" | "critical" | "saturated";

export const serviceUtilizationBands = {
  healthyMaximum: 0.7,
  warningMaximum: 0.9,
  criticalMaximum: 1,
} as const;

export interface ServiceRegionalCapacityMetrics {
  regionId: string;
  deploymentId: string;
  incomingRps: number;
  capacityRps: number;
  utilization: number;
  state: ServiceCapacityState;
}

export interface ServiceCapacityMetrics {
  incomingRps: number;
  capacityRps: number;
  handledRps: number;
  unmetRps: number;
  utilization: number;
  /** May be negative when overloaded so the shortfall remains visible. */
  headroom: number;
  state: ServiceCapacityState;
  /** Present when geographic deployments received traffic. */
  regions?: readonly ServiceRegionalCapacityMetrics[];
  /** Placement-aware mechanism evidence when workload affinity is active. */
  placement?: MechanismPlacementEvidence;
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
  const challenge = input.challenge;
  const services: Record<string, ServiceCapacityMetrics> = {};
  const events = [...propagation.events];

  for (const component of [...architecture.components].filter((candidate) => candidate.type === "service").sort((left, right) => left.id.localeCompare(right.id))) {
    const parsed = input.registry.get(component.type).configSchema.safeParse(component.config);
    if (!parsed.success) continue;
    const config = parsed.data as ServiceConfig;
    const incomingRps = propagation.traffic[component.id].incomingRps;
    if (input.overlay?.failedComponentIds?.includes(component.id)) {
      const metrics: ServiceCapacityMetrics = {
        incomingRps,
        capacityRps: 0,
        handledRps: 0,
        unmetRps: incomingRps,
        utilization: incomingRps > 0 ? Number.POSITIVE_INFINITY : 0,
        headroom: 0,
        state: "saturated",
      };
      services[component.id] = metrics;
      events.push(...capacityEvents(component.id, metrics));
      continue;
    }
    const capacityRps = serviceCapacityForConfig(config);
    const placement = resolveMechanismPlacement({
      challenge,
      catalogType: "service",
      nodeId: component.id,
      architecture,
      playerIntent: 1,
      handledRps: incomingRps,
    });
    const effectiveCapacityRps = capacityRps * activeCapacityScale(placement);

    const regionalIncoming = propagation.regionalTraffic[component.id];
    if (component.deployments.length > 0 && regionalIncoming) {
      const perInstance = serviceSizeModels[config.size].capacityPerInstance;
      const regions: ServiceRegionalCapacityMetrics[] = [];
      let handledRps = 0;
      let unmetRps = 0;
      let worstUtilization = 0;
      let worstHeadroom = Number.POSITIVE_INFINITY;

      for (const deployment of [...component.deployments].sort((left, right) => left.id.localeCompare(right.id))) {
        const instances = serviceInstancesFromDeployment(deployment) ?? 0;
        const regionCapacity = instances * perInstance * activeCapacityScale(placement);
        const regionIncoming = regionalIncoming[deployment.regionId]?.incomingRps ?? 0;
        const utilization = regionCapacity > 0 ? regionIncoming / regionCapacity : regionIncoming > 0 ? Number.POSITIVE_INFINITY : 0;
        const regionHeadroom =
          regionCapacity > 0
            ? (regionCapacity - regionIncoming) / regionCapacity
            : regionIncoming > 0
              ? 0
              : Number.POSITIVE_INFINITY;
        const state = stateForUtilization(utilization === Number.POSITIVE_INFINITY ? 2 : utilization);
        regions.push({
          regionId: deployment.regionId,
          deploymentId: deployment.id,
          incomingRps: regionIncoming,
          capacityRps: regionCapacity,
          utilization: utilization === Number.POSITIVE_INFINITY ? regionIncoming : utilization,
          state,
        });
        handledRps += Math.min(regionIncoming, regionCapacity);
        unmetRps += Math.max(0, regionIncoming - regionCapacity);
        worstUtilization = Math.max(worstUtilization, utilization === Number.POSITIVE_INFINITY ? 2 : utilization);
        if (regionHeadroom < worstHeadroom) worstHeadroom = regionHeadroom;
      }

      const metrics: ServiceCapacityMetrics = {
        incomingRps,
        capacityRps: effectiveCapacityRps,
        handledRps,
        unmetRps,
        utilization: worstUtilization,
        // Geo headroom is the worst regional headroom — idle capacity in other
        // regions must not mask a saturated nearest deployment.
        headroom: Number.isFinite(worstHeadroom) ? worstHeadroom : 0,
        state: stateForUtilization(worstUtilization),
        regions,
        ...(placement && challenge.workloadAffinity ? { placement } : {}),
      };
      services[component.id] = metrics;
      events.push(...capacityEvents(component.id, metrics));
      continue;
    }

    const utilization = effectiveCapacityRps > 0 ? incomingRps / effectiveCapacityRps : incomingRps > 0 ? Number.POSITIVE_INFINITY : 0;
    const metrics: ServiceCapacityMetrics = {
      incomingRps,
      capacityRps: effectiveCapacityRps,
      handledRps: Math.min(incomingRps, effectiveCapacityRps),
      unmetRps: Math.max(0, incomingRps - effectiveCapacityRps),
      utilization,
      headroom: effectiveCapacityRps > 0 ? (effectiveCapacityRps - incomingRps) / effectiveCapacityRps : 0,
      state: stateForUtilization(utilization === Number.POSITIVE_INFINITY ? 2 : utilization),
      ...(placement && challenge.workloadAffinity ? { placement } : {}),
    };
    services[component.id] = metrics;
    events.push(...capacityEvents(component.id, metrics));
  }

  return {
    valid: true,
    traffic: propagation.traffic,
    caches: propagation.caches,
    regionalWorkload: propagation.regionalWorkload,
    regionalTraffic: propagation.regionalTraffic,
    geographicRoutes: propagation.geographicRoutes,
    events,
    unroutableRps: propagation.unroutableRps,
    level2: propagation.level2,
    services,
  };
}
