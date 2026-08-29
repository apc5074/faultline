import type { WorkloadChannelFlowSummary, WorkloadPathFlow } from "@faultline/core";

/** Small tolerance for deterministic branch splitting and decimal RPS shares. */
export const WORKLOAD_FLOW_EPSILON = 1e-6;

function assertFiniteNonNegative(value: number, field: string, pathId: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Workload path "${pathId}" ${field} must be a finite non-negative number.`);
  }
}

/** Validates one simulator-produced path flow and its conservation invariant. */
export function assertWorkloadPathFlow(flow: WorkloadPathFlow): void {
  if (!flow.channelId || !flow.pathId || flow.componentIds.length === 0) {
    throw new Error("Workload path flow requires channelId, pathId, and componentIds.");
  }
  for (const [field, value] of [
    ["offeredRps", flow.offeredRps],
    ["acceptedRps", flow.acceptedRps],
    ["completedRps", flow.completedRps],
    ["failedRps", flow.failedRps],
    ["unresolvedRps", flow.unresolvedRps],
  ] as const) {
    assertFiniteNonNegative(value, field, flow.pathId);
  }
  if (flow.acceptedRps > flow.offeredRps + WORKLOAD_FLOW_EPSILON) {
    throw new Error(`Workload path "${flow.pathId}" accepted more traffic than it was offered.`);
  }
  const outcomeTotal = flow.completedRps + flow.failedRps + flow.unresolvedRps;
  if (Math.abs(outcomeTotal - flow.offeredRps) > WORKLOAD_FLOW_EPSILON) {
    throw new Error(`Workload path "${flow.pathId}" does not conserve offered traffic.`);
  }
  if (flow.completedRps > flow.acceptedRps + WORKLOAD_FLOW_EPSILON) {
    throw new Error(`Workload path "${flow.pathId}" completed more traffic than it accepted.`);
  }
}

/**
 * Aggregates mutually-exclusive path flows into one channel outcome.
 * The caller must provide every branch of the channel; missing demand is not
 * silently converted into success.
 */
export function aggregateWorkloadPathFlows(
  channelId: string,
  demandRps: number,
  paths: readonly WorkloadPathFlow[],
): WorkloadChannelFlowSummary {
  if (!channelId || !Number.isFinite(demandRps) || demandRps < 0) {
    throw new Error("Workload channel requires a finite non-negative demandRps.");
  }
  for (const path of paths) {
    if (path.channelId !== channelId) {
      throw new Error(`Workload path "${path.pathId}" belongs to channel "${path.channelId}", not "${channelId}".`);
    }
    assertWorkloadPathFlow(path);
  }

  const sum = (field: keyof Pick<WorkloadPathFlow, "offeredRps" | "acceptedRps" | "completedRps" | "failedRps" | "unresolvedRps">) =>
    paths.reduce((total, path) => total + path[field], 0);
  const offeredRps = sum("offeredRps");
  const acceptedRps = sum("acceptedRps");
  const completedRps = sum("completedRps");
  const failedRps = sum("failedRps");
  const unresolvedRps = sum("unresolvedRps");

  if (Math.abs(offeredRps - demandRps) > WORKLOAD_FLOW_EPSILON) {
    throw new Error(`Workload channel "${channelId}" paths do not account for all demand.`);
  }

  return {
    channelId,
    demandRps,
    offeredRps,
    acceptedRps,
    completedRps,
    failedRps,
    unresolvedRps,
    completionRatio: demandRps > 0 ? completedRps / demandRps : 1,
    failureRatio: demandRps > 0 ? failedRps / demandRps : 0,
    paths: [...paths].sort((left, right) => left.pathId.localeCompare(right.pathId)),
  };
}

