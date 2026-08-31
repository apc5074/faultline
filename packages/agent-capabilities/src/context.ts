import type { Architecture, ChallengeDefinition, CostResult, RequirementResult } from "@faultline/core";

import type { AgentRegionalEvidence } from "./regional-evidence.js";
import type { AgentWorkloadFitEvidence } from "./workload-fit-evidence.js";
import { phase7DynamicCapabilityPredicate } from "./architecture-predicates.js";
import { PHASE_7_DYNAMIC_CAPABILITY_NAMES } from "./capability-names.js";

/** Provenance attached to simulator-grounded reads across every adapter. */
export interface EvidenceMeta {
  readonly architectureRevision: string;
  readonly simulationRunId: string;
  readonly simulatorVersion: string;
  readonly isStale: boolean;
  readonly generatedAt: string;
}

/**
 * One capacity resource projected from shared simulator output.
 * Capabilities must not recompute instance×tier formulas — only present these facts.
 */
export interface AgentCapacityEntry {
  readonly resource: string;
  readonly capacity: number;
  readonly load: number;
  readonly utilization: number;
  readonly headroom: number;
}

/** System-level outcome facts from a grounded simulation snapshot. */
export interface AgentSystemMetrics {
  readonly redirectP95Ms?: number;
  readonly throughputPass?: boolean;
  readonly minimumHeadroom?: number;
}

/** Bounded, revision-stable WebMCP review packets materialized beside evidence. */
export interface ReviewUseCasePackets {
  readonly overview: { readonly failedRequirements: readonly RequirementResult[]; readonly highestImpactBottleneck?: unknown; readonly costHeadroom?: number };
  readonly component: Readonly<Record<string, { readonly component: unknown; readonly neighbors: readonly string[]; readonly relatedRequirements: readonly RequirementResult[] }>>;
  readonly requirement: Readonly<Record<string, { readonly result: RequirementResult; readonly implicatedComponentIds: readonly string[]; readonly caveats: readonly string[]; readonly relatedBottlenecks: readonly unknown[] }>>;
  readonly workload: Readonly<Record<string, { readonly channel: AgentWorkloadChannelEvidence }>>;
  readonly cost: { readonly contributors: readonly string[]; readonly topContributors: readonly unknown[]; readonly monthlyTotal?: number; readonly budget: number; readonly remainingBudget?: number };
}

export interface ReviewRevisionDelta {
  readonly fromRevision: string;
  readonly toRevision: string;
  readonly addedComponentIds: readonly string[];
  readonly removedComponentIds: readonly string[];
  readonly changedComponentIds: readonly string[];
  readonly addedConnectionIds: readonly string[];
  readonly removedConnectionIds: readonly string[];
  readonly changedRequirementIds: readonly string[];
  readonly metricDeltas: readonly { readonly componentId: string; readonly metric: string; readonly from?: number; readonly to?: number }[];
  readonly costDelta?: { readonly monthlyTotal: number; readonly amount: number };
  readonly changedWorkloadChannelIds: readonly string[];
  readonly firstChangedConstrainedHop?: string;
  readonly dynamicCapabilitiesAdded: readonly string[];
  readonly dynamicCapabilitiesRemoved: readonly string[];
  readonly unchangedCriticalCaveats: readonly string[];
}

/** Scenario outcomes attached to the snapshot (e.g. viral hot-key). */
export interface AgentScenarioEvidence {
  readonly hotKey?: {
    readonly active: boolean;
    readonly passed: boolean;
  };
  readonly processing?: {
    readonly deadlineCompletionRatio: number;
    readonly deadlineMissRatio: number;
  };
  readonly playback?: {
    readonly requestedStartsPerSecond: number;
    readonly cdnHitStartsPerSecond: number;
    readonly originReadStartsPerSecond: number;
    readonly startupP95LatencyMs: number;
    readonly originReadBytesPerSecond: number;
  };
}

/** Simulator-owned end-to-end path facts exposed without leaking simulator internals. */
export interface AgentWorkloadPathEvidence {
  readonly pathId: string;
  readonly componentIds: readonly string[];
  readonly connectionIds: readonly string[];
  readonly status: "complete" | "partial" | "failed";
  readonly failureCode?: string;
  readonly failureReason?: string;
  readonly terminalRuleId?: string;
}

export interface AgentWorkloadChannelEvidence {
  readonly channelId: string;
  readonly paths: readonly AgentWorkloadPathEvidence[];
  readonly inactiveComponentIds: readonly string[];
}

/**
 * Compact per-component simulator facts for one AgentContext snapshot.
 * Populated server-side from the shared simulator — capabilities must not recompute formulas.
 */
export interface AgentComponentEvidence {
  readonly metrics: Readonly<Record<string, number>>;
  /** Capacity-band state when the simulator produced one. */
  readonly state?: string;
  /** Optional structured capacity rows; when omitted, estimate_capacity may project from metrics. */
  readonly capacity?: readonly AgentCapacityEntry[];
  /** Workload affinity placement evidence when the simulator produced it. */
  readonly workloadFit?: AgentWorkloadFitEvidence;
}

/**
 * Immutable simulation evidence attached to AgentContext.
 * Absent or `available: false` means capabilities omit invented metrics.
 */
export type AgentSimulationEvidence =
  | {
      readonly available: true;
      readonly components: Readonly<Record<string, AgentComponentEvidence>>;
      readonly system?: AgentSystemMetrics;
      readonly scenarios?: AgentScenarioEvidence;
      readonly regional?: AgentRegionalEvidence;
      readonly workloadPaths?: Readonly<Record<string, AgentWorkloadChannelEvidence>>;
    }
  | {
      readonly available: false;
      readonly validationErrors?: readonly string[];
    };

/**
 * Immutable per-request snapshot for capability execution.
 * Built once after architecture validation and challenge resolution.
 */
export interface AgentLevelTeaching {
  readonly narrative: {
    readonly hook: string;
    readonly stakes: string;
  };
  readonly teaching: {
    readonly componentTypes: readonly {
      readonly type: string;
      readonly placementIntent: string;
    }[];
  };
}

export interface AgentContext {
  readonly challenge: ChallengeDefinition;
  readonly architecture: Architecture;
  readonly simulation?: AgentSimulationEvidence;
  readonly cost?: CostResult;
  /** Simulator-owned requirement outcomes for compact grounded reviews. */
  readonly requirementResults?: readonly RequirementResult[];
  readonly user?: {
    readonly authenticated: boolean;
  };
  /** Present when the context was built from trusted simulator evidence. */
  readonly evidenceMeta?: EvidenceMeta;
  /**
   * Optional Level Profile teaching slice (LP-06).
   * Compact narrative + placement intents only — never playtest checklists or pros/cons walls.
   */
  readonly levelTeaching?: AgentLevelTeaching;
  /** Optional WebMCP-local packets; absent for other adapters and legacy contexts. */
  readonly reviewPackets?: ReviewUseCasePackets;
  readonly reviewDelta?: ReviewRevisionDelta;
  /** Retained comparison baselines for WMP-018; WebMCP-owned, never cross-player. */
  readonly comparisonBaselines?: ComparisonBaselines;
}

export interface ComparisonSnapshot {
  readonly evidenceMeta: EvidenceMeta;
  readonly architecture: {
    readonly version: Architecture["version"];
    readonly components: readonly Omit<Architecture["components"][number], "ui">[];
    readonly connections: Architecture["connections"];
  };
  readonly simulation?: AgentSimulationEvidence;
  readonly requirementResults?: readonly RequirementResult[];
  readonly cost?: CostResult;
  readonly dynamicCapabilityNames: readonly string[];
}

export interface ComparisonBaselines {
  /** Full AgentContext remains accepted for the migration window only. */
  readonly previousReview?: ComparisonSnapshot | AgentContext;
  readonly lastPlayerRun?: ComparisonSnapshot | AgentContext;
}

export function comparisonSnapshotFromContext(context: AgentContext): ComparisonSnapshot {
  const simulation = context.simulation?.available === true
    ? {
        available: true as const,
        components: Object.fromEntries(Object.entries(context.simulation.components).map(([id, evidence]) => [id, {
          metrics: evidence.metrics,
          ...(evidence.state !== undefined ? { state: evidence.state } : {}),
        }])),
        ...(context.simulation.system ? { system: context.simulation.system } : {}),
        ...(context.simulation.scenarios ? { scenarios: context.simulation.scenarios } : {}),
        ...(context.simulation.workloadPaths ? { workloadPaths: context.simulation.workloadPaths } : {}),
      }
    : context.simulation;
  const semanticArchitecture = {
    version: context.architecture.version,
    components: context.architecture.components.map(({ ui: _ui, ...component }) => component),
    connections: context.architecture.connections,
  };
  return {
    evidenceMeta: evidenceMetaFor(context),
    architecture: semanticArchitecture,
    ...(simulation ? { simulation } : {}),
    ...(context.requirementResults ? { requirementResults: context.requirementResults } : {}),
    ...(context.cost ? { cost: { monthlyTotal: context.cost.monthlyTotal, lineItems: context.cost.lineItems.map(({ componentId, amount, label }) => ({ componentId, amount, ...(label !== undefined ? { label } : {}) })) } } : {}),
    dynamicCapabilityNames: PHASE_7_DYNAMIC_CAPABILITY_NAMES.filter((name) => phase7DynamicCapabilityPredicate(name, context.architecture)),
  };
}

/** Rehydrate only the comparison-facing shape; never reintroduce retained context fields. */
export function comparisonContextFromSnapshot(snapshot: ComparisonSnapshot, challenge: ChallengeDefinition): AgentContext {
  return {
    challenge,
    architecture: snapshot.architecture as Architecture,
    ...(snapshot.simulation ? { simulation: snapshot.simulation } : {}),
    ...(snapshot.requirementResults ? { requirementResults: snapshot.requirementResults } : {}),
    ...(snapshot.cost ? { cost: snapshot.cost } : {}),
    evidenceMeta: snapshot.evidenceMeta,
  };
}

/** Safe fallback for synthetic/dev contexts that predate evidence metadata. */
export function evidenceMetaFor(context: AgentContext): EvidenceMeta {
  return context.evidenceMeta ?? {
    architectureRevision: "unversioned",
    simulationRunId: "unversioned",
    simulatorVersion: "unknown",
    isStale: context.simulation?.available !== true,
    generatedAt: "unknown",
  };
}
