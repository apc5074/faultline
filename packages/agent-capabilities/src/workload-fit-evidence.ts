import type {
  ArchitecturalRoleId,
  ChallengeDefinition,
  WorkloadMechanismId,
} from "@faultline/core";

/**
 * Compact simulator-derived workload-fit facts for one component.
 * Capabilities present these; they never invent ceilings or prescribe topology.
 */
export interface AgentWorkloadFitEvidence {
  readonly participation: "active" | "idle";
  readonly role: ArchitecturalRoleId;
  readonly mechanismId: WorkloadMechanismId;
  readonly challengeCeiling: number;
  readonly playerIntent: number;
  /** Effective benefit on handled work (`ceiling × intent` when active; 0 when idle). */
  readonly effective: number;
  readonly unitCostPressure?: number;
  readonly processingLatencyPenaltyMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pressuresForMechanism(
  challenge: ChallengeDefinition,
  mechanismId: WorkloadMechanismId,
): Pick<AgentWorkloadFitEvidence, "unitCostPressure" | "processingLatencyPenaltyMs"> {
  const affinity = challenge.workloadAffinity?.mechanisms[mechanismId];
  return {
    ...(affinity?.unitCostPressure !== undefined ? { unitCostPressure: affinity.unitCostPressure } : {}),
    ...(affinity?.processingLatencyPenaltyMs !== undefined
      ? { processingLatencyPenaltyMs: affinity.processingLatencyPenaltyMs }
      : {}),
  };
}

/** Extract fit evidence from cache metrics (role/mechanism are string fields on CacheResult). */
export function workloadFitFromCacheMetrics(
  metrics: object,
  challenge: ChallengeDefinition,
): AgentWorkloadFitEvidence | undefined {
  const record = metrics as Record<string, unknown>;
  const role = record.role;
  const mechanismId = record.mechanismId;
  const challengeCeiling = record.challengeCeiling;
  const playerIntent = record.playerIntent;
  const effective = record.effectiveConfiguredHitRate;
  if (
    typeof role !== "string" ||
    typeof mechanismId !== "string" ||
    typeof challengeCeiling !== "number" ||
    typeof playerIntent !== "number" ||
    typeof effective !== "number"
  ) {
    return undefined;
  }

  const hitRps = typeof record.hitRps === "number" ? record.hitRps : 0;
  const typedMechanism = mechanismId as WorkloadMechanismId;
  return {
    participation: hitRps > 0 ? "active" : "idle",
    role: role as ArchitecturalRoleId,
    mechanismId: typedMechanism,
    challengeCeiling,
    playerIntent,
    effective,
    ...pressuresForMechanism(challenge, typedMechanism),
  };
}

/** Extract fit evidence from service/postgres `placement` objects. */
export function workloadFitFromPlacement(placement: unknown): AgentWorkloadFitEvidence | undefined {
  if (!isRecord(placement)) return undefined;
  const {
    participation,
    role,
    mechanismId,
    challengeCeiling,
    playerIntent,
    effective,
    unitCostPressure,
    processingLatencyPenaltyMs,
  } = placement;
  if (
    (participation !== "active" && participation !== "idle") ||
    typeof role !== "string" ||
    typeof mechanismId !== "string" ||
    typeof challengeCeiling !== "number" ||
    typeof playerIntent !== "number" ||
    typeof effective !== "number"
  ) {
    return undefined;
  }

  return {
    participation,
    role: role as ArchitecturalRoleId,
    mechanismId: mechanismId as WorkloadMechanismId,
    challengeCeiling,
    playerIntent,
    effective,
    ...(typeof unitCostPressure === "number" ? { unitCostPressure } : {}),
    ...(typeof processingLatencyPenaltyMs === "number" ? { processingLatencyPenaltyMs } : {}),
  };
}

/** Compact challenge-authored mechanism ceilings for get_challenge (no byRole solution key). */
export interface CompactWorkloadMechanismAffinity {
  readonly mechanismId: WorkloadMechanismId;
  readonly maxEffectiveness: number;
  readonly note?: string;
  readonly unitCostPressure?: number;
  readonly processingLatencyPenaltyMs?: number;
}

export interface CompactWorkloadAffinity {
  readonly mechanisms: readonly CompactWorkloadMechanismAffinity[];
}

/** Challenge affinity summary safe for agent grounding — mechanisms + notes, not placement recipes. */
export function compactWorkloadAffinity(challenge: ChallengeDefinition): CompactWorkloadAffinity | undefined {
  const affinity = challenge.workloadAffinity;
  if (!affinity) return undefined;

  const mechanisms = (Object.keys(affinity.mechanisms) as WorkloadMechanismId[])
    .sort((left, right) => left.localeCompare(right))
    .flatMap((mechanismId) => {
      const entry = affinity.mechanisms[mechanismId];
      if (!entry) return [];
      return [
        {
          mechanismId,
          maxEffectiveness: entry.maxEffectiveness,
          ...(entry.note !== undefined ? { note: entry.note } : {}),
          ...(entry.unitCostPressure !== undefined ? { unitCostPressure: entry.unitCostPressure } : {}),
          ...(entry.processingLatencyPenaltyMs !== undefined
            ? { processingLatencyPenaltyMs: entry.processingLatencyPenaltyMs }
            : {}),
        } satisfies CompactWorkloadMechanismAffinity,
      ];
    });

  return mechanisms.length > 0 ? { mechanisms } : undefined;
}
