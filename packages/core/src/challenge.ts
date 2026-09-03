export type RequirementType = "throughput" | "latency" | "headroom" | "budget";
export type RequirementComparator = "gte" | "lte" | "lt";
export type RequirementMetric = "completion_ratio" | "p95_latency_ms";

/** A requirement is evaluated from simulation/cost outcomes, never component names. */
export interface RequirementDefinition {
  id: string;
  label: string;
  type: RequirementType;
  comparator: RequirementComparator;
  target: number;
  unit: string;
  /** Optional Level 2 evidence binding; omitted requirements use legacy aggregates. */
  channelId?: string;
  metric?: RequirementMetric;
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

export type { WorkloadChannel, WorkloadChannelKind } from "./workload.js";
export type { WorkloadCompletionContract } from "./workload-contract.js";

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

/** Server-only learning guidance; never a canonical solution or topology. */
export interface ChallengeCoachingPolicy {
  focusThemes: readonly string[];
  prohibitedRevealCategories: readonly string[];
}

/** What job a placed component can do, independent of where it sits in the graph. */
export type WorkloadMechanismId =
  | "edge_cache"
  | "data_cache"
  | "request_fanout"
  | "geo_routing"
  | "stateless_compute"
  | "durable_store"
  | "object_store"
  | "async_buffer"
  | "async_consumer";

/** Where a component sits in the request/data path, derived by the simulator from topology. */
export type ArchitecturalRoleId =
  | "edge_ingress"
  | "path_middleware"
  | "compute"
  | "read_aside"
  | "write_path"
  | "geo_route"
  | "primary_store"
  | "replica_store"
  | "object_store"
  | "async_buffer"
  | "async_consumer"
  | "unreachable"
  | "misplaced";

/** Challenge-authored ceiling for how useful one mechanism is for this workload. */
export interface MechanismAffinity {
  /** Baseline ceiling for this mechanism on this challenge (0..1). */
  maxEffectiveness: number;
  /**
   * Optional per-role multipliers (0..1). Final ceiling =
   * maxEffectiveness × roleMultiplier[role] (missing role → mechanism defaultRoleMultiplier).
   */
  byRole?: Partial<Record<ArchitecturalRoleId, number>>;
  /** Default role multiplier when byRole omits the resolved role. Default 1.0; use low for misplaced. */
  defaultRoleMultiplier?: number;
  /** Caches only: how concentrated reusable keys are (0..1). High → hot-key friendly. */
  reuseConcentration?: number;
  /**
   * Optional multiplier on usage-sensitive cost for handled work on this challenge (default 1.0).
   * Idle components keep base catalog cost only.
   */
  unitCostPressure?: number;
  /** Optional additive processing latency (ms) when this mechanism serves active work in-role. */
  processingLatencyPenaltyMs?: number;
  /** Author note for briefing/coaching — never scored. */
  note?: string;
}

/** Challenge-authored placement-aware scoring ceilings. Omitting this preserves legacy (ceiling 1.0) behavior. */
export interface WorkloadAffinity {
  mechanisms: Partial<Record<WorkloadMechanismId, MechanismAffinity>>;
  /** Global fallback when a resolved role has no byRole entry and no defaultRoleMultiplier. */
  roleDefaults?: Partial<Record<ArchitecturalRoleId, number>>;
}

/** Challenge-owned configuration consumed by the simulator and UI. */
export interface ChallengeDefinition {
  slug: string;
  version: number;
  title: string;
  prompt: string;
  developmentOnly: boolean;
  workload: WorkloadDefinition;
  /** Optional named demand streams for multi-workload levels. */
  workloadChannels?: readonly import("./workload.js").WorkloadChannel[];
  /** Optional channel-specific graph semantics for end-to-end completion. */
  workloadCompletionContracts?: readonly import("./workload-contract.js").WorkloadCompletionContract[];
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
  coachingPolicy?: ChallengeCoachingPolicy;
  /**
   * Placement-aware scoring ceilings by mechanism/role. Omit for legacy behavior
   * (mechanism ceiling 1.0; simulator role defaults still demote unreachable/misplaced).
   */
  workloadAffinity?: WorkloadAffinity;
  /** Deferred targets (e.g. availability) preserved without dishonest scoring. */
  unscoredTargets?: readonly UnscoredChallengeTarget[];
  requirements: readonly RequirementDefinition[];
  monthlyBudget: number;
  allowedComponentTypes: readonly string[];
}
