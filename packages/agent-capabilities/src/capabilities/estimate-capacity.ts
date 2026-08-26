import type { AgentCapability } from "../capability.js";
import type { AgentCapacityEntry, AgentComponentEvidence, AgentContext } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { estimateCapacityInputSchema, type EstimateCapacityInput } from "../schemas.js";

export interface CapacityComponentSummary {
  readonly componentId: string;
  readonly resource?: string;
  readonly capacity: number;
  readonly load: number;
  readonly headroom: number;
}

export interface CapacityBottleneck {
  readonly componentId: string;
  readonly resource: string;
  readonly utilization: number;
}

export interface EstimateCapacityArchitectureOutput {
  readonly bottleneck?: CapacityBottleneck;
  readonly components: readonly CapacityComponentSummary[];
}

export interface EstimateCapacityComponentOutput {
  readonly componentId: string;
  readonly resources: readonly AgentCapacityEntry[];
}

export type EstimateCapacityOutput =
  | EstimateCapacityArchitectureOutput
  | EstimateCapacityComponentOutput;

function headroomFromUtilization(utilization: number): number {
  return Number((1 - utilization).toFixed(6));
}

/**
 * Project capacity rows from compact metrics already produced by the simulator.
 * Does not apply instance/tier formulas — only renames existing numeric facts.
 */
export function capacityEntriesFromMetrics(
  metrics: Readonly<Record<string, number>>,
): AgentCapacityEntry[] {
  const entries: AgentCapacityEntry[] = [];

  if (typeof metrics.capacityRps === "number" && typeof metrics.incomingRps === "number") {
    const utilization =
      typeof metrics.utilization === "number"
        ? metrics.utilization
        : metrics.capacityRps > 0
          ? metrics.incomingRps / metrics.capacityRps
          : 0;
    entries.push({
      resource: "request_capacity",
      capacity: metrics.capacityRps,
      load: metrics.incomingRps,
      utilization,
      headroom: typeof metrics.headroom === "number" ? metrics.headroom : headroomFromUtilization(utilization),
    });
  }

  if (typeof metrics.readCapacityRps === "number" && typeof metrics.readRps === "number") {
    const utilization =
      typeof metrics.readUtilization === "number"
        ? metrics.readUtilization
        : metrics.readCapacityRps > 0
          ? metrics.readRps / metrics.readCapacityRps
          : 0;
    entries.push({
      resource: "read",
      capacity: metrics.readCapacityRps,
      load: metrics.readRps,
      utilization,
      headroom: headroomFromUtilization(utilization),
    });
  }

  if (typeof metrics.writeCapacityRps === "number" && typeof metrics.writeRps === "number") {
    const utilization =
      typeof metrics.writeUtilization === "number"
        ? metrics.writeUtilization
        : metrics.writeCapacityRps > 0
          ? metrics.writeRps / metrics.writeCapacityRps
          : 0;
    entries.push({
      resource: "write",
      capacity: metrics.writeCapacityRps,
      load: metrics.writeRps,
      utilization,
      headroom: headroomFromUtilization(utilization),
    });
  }

  return entries;
}

function entriesForEvidence(evidence: AgentComponentEvidence): readonly AgentCapacityEntry[] {
  if (evidence.capacity && evidence.capacity.length > 0) return evidence.capacity;
  return capacityEntriesFromMetrics(evidence.metrics);
}

function requireAvailableSimulation(context: AgentContext) {
  if (!context.simulation || context.simulation.available !== true) {
    return capabilityError("SIMULATION_UNAVAILABLE", "Capacity requires available simulation evidence.");
  }
  return context.simulation;
}

function toSummary(componentId: string, entry: AgentCapacityEntry): CapacityComponentSummary {
  return {
    componentId,
    ...(entry.resource === "request_capacity" ? {} : { resource: entry.resource }),
    capacity: entry.capacity,
    load: entry.load,
    headroom: entry.headroom,
  };
}

function pickPrimaryEntry(entries: readonly AgentCapacityEntry[]): AgentCapacityEntry | undefined {
  if (entries.length === 0) return undefined;
  return [...entries].sort((left, right) => {
    if (right.utilization !== left.utilization) return right.utilization - left.utilization;
    return left.resource.localeCompare(right.resource);
  })[0];
}

function buildArchitectureSummary(
  components: Readonly<Record<string, AgentComponentEvidence>>,
): EstimateCapacityArchitectureOutput {
  const rows: CapacityComponentSummary[] = [];
  let bottleneck: CapacityBottleneck | undefined;

  for (const componentId of Object.keys(components).sort((left, right) => left.localeCompare(right))) {
    const entries = entriesForEvidence(components[componentId]!);
    const primary = pickPrimaryEntry(entries);
    if (!primary) continue;
    rows.push(toSummary(componentId, primary));
    if (!bottleneck || primary.utilization > bottleneck.utilization) {
      bottleneck = {
        componentId,
        resource: primary.resource,
        utilization: primary.utilization,
      };
    } else if (
      primary.utilization === bottleneck.utilization &&
      (componentId.localeCompare(bottleneck.componentId) < 0 ||
        (componentId === bottleneck.componentId && primary.resource.localeCompare(bottleneck.resource) < 0))
    ) {
      bottleneck = {
        componentId,
        resource: primary.resource,
        utilization: primary.utilization,
      };
    }
  }

  return {
    ...(bottleneck ? { bottleneck } : {}),
    components: rows,
  };
}

/**
 * Present capacity facts from AgentContext simulation evidence.
 * Never multiplies instances × tier throughput — that belongs to the simulator.
 */
export function estimateCapacity(
  context: AgentContext,
  input: EstimateCapacityInput = {},
): CapabilityResult<EstimateCapacityOutput> {
  const simulation = requireAvailableSimulation(context);
  if ("ok" in simulation) return simulation;

  if (input.componentId !== undefined) {
    const exists = context.architecture.components.some((component) => component.id === input.componentId);
    if (!exists) {
      return capabilityError("NOT_FOUND", `Unknown component "${input.componentId}".`);
    }
    const evidence = simulation.components[input.componentId];
    return capabilityOk({
      componentId: input.componentId,
      resources: evidence ? [...entriesForEvidence(evidence)] : [],
    });
  }

  return capabilityOk(buildArchitectureSummary(simulation.components));
}

export const estimateCapacityCapability: AgentCapability<
  AgentContext,
  EstimateCapacityInput,
  CapabilityResult<EstimateCapacityOutput>
> = {
  name: "estimate_capacity",
  description:
    "Summarize capacity, load, headroom, and the highest-utilization bottleneck from simulator evidence. Optional componentId for one component.",
  inputSchema: estimateCapacityInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context, input) {
    return estimateCapacity(context, input);
  },
};
