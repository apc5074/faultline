import type { Architecture, ChallengeDefinition, CostResult } from "@faultline/core";

import type { AgentRegionalEvidence } from "./regional-evidence.js";
import type { AgentWorkloadFitEvidence } from "./workload-fit-evidence.js";

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

/** Scenario outcomes attached to the snapshot (e.g. viral hot-key). */
export interface AgentScenarioEvidence {
  readonly hotKey?: {
    readonly active: boolean;
    readonly passed: boolean;
  };
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
  readonly user?: {
    readonly authenticated: boolean;
  };
  /**
   * Optional Level Profile teaching slice (LP-06).
   * Compact narrative + placement intents only — never playtest checklists or pros/cons walls.
   */
  readonly levelTeaching?: AgentLevelTeaching;
}
