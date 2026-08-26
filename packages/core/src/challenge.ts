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
