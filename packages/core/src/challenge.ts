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
  /**
   * Fraction of redirect/read traffic concentrated on one viral key (0..1).
   * Omit or 0 to disable the hot-key scenario (e.g. Tiny API).
   */
  hotKeyReadFraction?: number;
}

/**
 * Challenge-owned user traffic share for one region.
 * Fractions across the distribution must sum to 1.
 */
export interface GeographicTrafficShare {
  regionId: string;
  fraction: number;
}

/**
 * Product targets carried in challenge config but not scored until truthful semantics exist.
 * Must never be treated as pass/fail requirements.
 */
export interface UnscoredChallengeTarget {
  id: string;
  label: string;
  target: number;
  unit: string;
  reason: string;
}

/**
 * Educational byte sizes for projecting cross-region transfer cost.
 * Challenge-owned tuning assumptions — not real measured payloads.
 */
export interface TransferPayloadAssumptions {
  /** Typical redirect / read response over the request path. */
  redirectResponseBytes: number;
  /** Typical new-link / write request over the request path. */
  writeRequestBytes: number;
  /** Typical database read payload (Service/Redis → Postgres or Redis). */
  databaseReadBytes: number;
  /** Typical database write payload (Service → Postgres primary). */
  databaseWriteBytes: number;
  /** Bytes replicated from primary → each remote replica per write. */
  replicationBytesPerWrite: number;
}

/** Challenge-owned configuration consumed by the simulator and UI. */
export interface ChallengeDefinition {
  slug: string;
  version: number;
  title: string;
  prompt: string;
  developmentOnly: boolean;
  workload: WorkloadDefinition;
  /**
   * User traffic origin fractions by region.
   * Omit when geography is inactive (e.g. Tiny API). Belongs to the challenge, not RegionRegistry.
   * Phase 3 activates these fractions via `deriveRegionalWorkload` for traffic origins.
   */
  geographicDistribution?: readonly GeographicTrafficShare[];
  /**
   * Centralized educational payload sizes for transfer cost.
   * Required for truthful cross-region billing when geographic routes exist.
   */
  transferPayload?: TransferPayloadAssumptions;
  /** Deferred targets (e.g. availability) preserved without dishonest scoring. */
  unscoredTargets?: readonly UnscoredChallengeTarget[];
  requirements: readonly RequirementDefinition[];
  monthlyBudget: number;
  allowedComponentTypes: readonly string[];
}
