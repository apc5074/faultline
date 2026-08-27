import { componentRegistry } from "@faultline/component-catalog";
import { isValidRegion } from "@faultline/core";
import { propagateTraffic, type GeographicRoute, type SimulationEvent } from "@faultline/simulator";
import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { traceRequestInputSchema, type TraceRequestInput } from "../schemas.js";

export interface TraceRequestHop {
  readonly order: number;
  readonly connectionId?: string;
  readonly componentId?: string;
  readonly deploymentId?: string;
  readonly originRegionId?: string;
  readonly destinationRegionId?: string;
  readonly networkLatencyMs?: number;
  readonly requestsPerSecond?: number;
  readonly readRequestsPerSecond?: number;
  readonly writeRequestsPerSecond?: number;
  readonly terminal?: "unroutable";
}
export interface TraceRequestOutput {
  readonly geographic: boolean;
  readonly kind: "redirect" | "write";
  readonly hops: readonly TraceRequestHop[];
  readonly terminalReason?: "unroutable" | "no_matching_path";
}

function routeHop(route: GeographicRoute, order: number): TraceRequestHop {
  return { order, componentId: route.componentId, deploymentId: route.deploymentId, originRegionId: route.originRegion, destinationRegionId: route.destinationRegion, networkLatencyMs: route.networkLatencyMs, requestsPerSecond: route.rps };
}

function eventHop(event: SimulationEvent, order: number): TraceRequestHop {
  const data = event.data;
  return {
    order, ...(event.connectionId ? { connectionId: event.connectionId } : {}), ...(event.componentId ? { componentId: event.componentId } : {}),
    ...(typeof data.requestsPerSecond === "number" ? { requestsPerSecond: data.requestsPerSecond } : {}),
    ...(typeof data.readRequestsPerSecond === "number" ? { readRequestsPerSecond: data.readRequestsPerSecond } : {}),
    ...(typeof data.writeRequestsPerSecond === "number" ? { writeRequestsPerSecond: data.writeRequestsPerSecond } : {}),
    ...(typeof data.originRegion === "string" ? { originRegionId: data.originRegion } : {}),
    ...(typeof data.destinationRegion === "string" ? { destinationRegionId: data.destinationRegion } : {}),
    ...(data.kind === "unroutable" ? { terminal: "unroutable" as const } : {}),
  };
}

export function traceRequest(context: AgentContext, input: TraceRequestInput): CapabilityResult<TraceRequestOutput> {
  const regional = context.challenge.geographicDistribution !== undefined && context.challenge.geographicDistribution.length > 0;
  if (regional && input.originRegionId !== undefined && (!isValidRegion(input.originRegionId) || !context.challenge.geographicDistribution?.some((origin) => origin.regionId === input.originRegionId))) {
    return capabilityError("INVALID_INPUT", `originRegionId "${input.originRegionId}" is not an active challenge origin.`);
  }
  const result = propagateTraffic({ architecture: context.architecture, challenge: context.challenge, registry: componentRegistry });
  if (!result.valid) return capabilityError("SIMULATION_UNAVAILABLE", "Architecture or challenge baseline is invalid for simulation.");
  const kind = input.kind ?? "redirect";
  if (regional) {
    const routes = result.geographicRoutes.filter((route) =>
      (input.originRegionId === undefined || route.originRegion === input.originRegionId) &&
      (route.kind === "request" || (kind === "redirect" ? route.kind === "read" : route.kind === "write")),
    );
    const hops = routes.map((route, index) => routeHop(route, index + 1));
    return capabilityOk({ geographic: true, kind, hops, ...(result.unroutableRps > 0 ? { terminalReason: "unroutable" as const } : hops.length === 0 ? { terminalReason: "no_matching_path" as const } : {}) });
  }
  const events = result.events.filter((event) => event.type === "traffic_routed" && (event.data.kind === "request" || event.data.kind === "read_write"));
  const hops = events.map((event, index) => eventHop(event, index + 1));
  return capabilityOk({ geographic: false, kind, hops, ...(result.unroutableRps > 0 ? { terminalReason: "unroutable" as const } : hops.length === 0 ? { terminalReason: "no_matching_path" as const } : {}) });
}

export const traceRequestCapability: AgentCapability<AgentContext, TraceRequestInput, CapabilityResult<TraceRequestOutput>> = {
  name: "trace_request",
  description: "Trace a deterministic representative redirect or write path from simulator routing evidence. This is read-only and uses no random request IDs, clocks, or live infrastructure.",
  inputSchema: traceRequestInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute(context, input) { return traceRequest(context, input); },
};
