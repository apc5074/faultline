/** A branch's outcome for one named workload channel. */
export type WorkloadPathStatus = "complete" | "partial" | "failed";
export type WorkloadComponentStatus = "active" | "partial" | "inactive";

export type WorkloadFailureCode =
  | "missing_downstream_path"
  | "missing_required_dependency"
  | "capacity_shortfall"
  | "invalid_configuration"
  | "unroutable";

/**
 * Authoritative flow evidence for one mutually-exclusive workload branch.
 * Values are simulator outputs; they are never supplied by the UI or agent.
 */
export interface WorkloadPathFlow {
  channelId: string;
  pathId: string;
  componentIds: readonly string[];
  offeredRps: number;
  acceptedRps: number;
  completedRps: number;
  failedRps: number;
  unresolvedRps: number;
  terminalRole?: string;
  status: WorkloadPathStatus;
  failureCode?: WorkloadFailureCode;
  failureReason?: string;
}

/** Workload-specific evidence for one component. */
export interface WorkloadComponentFlow {
  channelId: string;
  componentId: string;
  incomingRps: number;
  acceptedRps: number;
  forwardedRps: number;
  completedRps: number;
  failedRps: number;
  status: WorkloadComponentStatus;
  failureCode?: WorkloadFailureCode;
  failureReason?: string;
}

/** Aggregate outcome for one complete workload channel. */
export interface WorkloadChannelFlowSummary {
  channelId: string;
  demandRps: number;
  offeredRps: number;
  acceptedRps: number;
  completedRps: number;
  failedRps: number;
  unresolvedRps: number;
  completionRatio: number;
  failureRatio: number;
  paths: readonly WorkloadPathFlow[];
}

