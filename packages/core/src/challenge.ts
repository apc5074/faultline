export type RequirementType = "throughput" | "latency" | "headroom" | "budget";
export type RequirementComparator = "gte" | "lte" | "lt";

/** A requirement is evaluated from simulation/cost outcomes, never component names. */
export interface RequirementDefinition {
  id: string;
  label: string;
  type: RequirementType;
  comparator: RequirementComparator;
  target: number;
  unit: string;
}

/** Deterministic outcome of evaluating one challenge requirement against simulated metrics. */
export interface RequirementResult {
  id: string;
  type: RequirementType;
  passed: boolean;
  actual: number;
  target: number;
  operator: RequirementComparator;
  explanation: string;
}

export interface WorkloadDefinition {
  requestsPerSecond: number;
  readRatio: number;
  writeRatio: number;
}

/** Challenge-owned configuration consumed by the simulator and UI. */
export interface ChallengeDefinition {
  slug: string;
  version: number;
  title: string;
  prompt: string;
  developmentOnly: boolean;
  workload: WorkloadDefinition;
  requirements: readonly RequirementDefinition[];
  monthlyBudget: number;
  allowedComponentTypes: readonly string[];
}
