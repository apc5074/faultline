import type { AgentContext } from "./context.js";
import {
  MAX_EVIDENCE_CONTINUATIONS,
  validateEvidenceContinuation,
  type EntityKind,
  type EvidenceContinuation,
} from "./evidence-result.js";

export interface SelectEvidenceContinuationsOptions {
  readonly candidates: readonly unknown[];
  readonly context: AgentContext;
  readonly evidenceRevision: string;
  readonly surfaceRevision: string;
  readonly availableCapabilityNames: ReadonlySet<string>;
  readonly limit?: number;
}

const reasonPriority: Readonly<Record<EvidenceContinuation["reasonCode"], number>> = {
  inspect_subject: 0,
  inspect_connection: 0,
  trace_workload: 0,
  explain_requirement: 0,
  explain_capacity: 1,
  inspect_cost_contributor: 1,
  expand_review: 2,
  compare_revision: 3,
};

function currentEntityIds(context: AgentContext): Readonly<Record<EntityKind, ReadonlySet<string>>> {
  const workloadIds = new Set<string>();
  const simulation = context.simulation?.available === true ? context.simulation : undefined;
  for (const resolution of Object.values(simulation?.workloadPaths ?? {})) {
    workloadIds.add(resolution.channelId);
  }
  const regionIds = new Set<string>(context.architecture.components.flatMap((component) => component.deployments.map((deployment) => deployment.regionId)));
  return {
    component: new Set(context.architecture.components.map((component) => component.id)),
    connection: new Set(context.architecture.connections.map((connection) => connection.id)),
    requirement: new Set((context.requirementResults ?? []).map((requirement) => requirement.id)),
    region: regionIds,
    workload: workloadIds,
    scenario: new Set(Object.keys(simulation?.scenarios ?? {})),
    experiment: new Set(),
  };
}

function targetsAreCurrent(continuation: EvidenceContinuation, ids: Readonly<Record<EntityKind, ReadonlySet<string>>>): boolean {
  return (continuation.targetRefs ?? []).every((target) => ids[target.kind].has(target.entityId));
}

function continuationKey(continuation: EvidenceContinuation): string {
  return JSON.stringify({
    capabilityName: continuation.capabilityName,
    input: continuation.input,
    evidenceRevision: continuation.evidenceRevision,
  });
}

/**
 * Select current, manifest-valid continuations without performing domain work.
 * Candidate construction belongs to the capability result selectors; this
 * function owns validation, freshness, ordering, deduplication, and bounds.
 */
export function selectEvidenceContinuations(
  options: SelectEvidenceContinuationsOptions,
): readonly EvidenceContinuation[] {
  const ids = currentEntityIds(options.context);
  const limit = Math.max(0, Math.min(options.limit ?? MAX_EVIDENCE_CONTINUATIONS, MAX_EVIDENCE_CONTINUATIONS));
  const seen = new Set<string>();
  return options.candidates
    .filter((candidate): candidate is EvidenceContinuation =>
      validateEvidenceContinuation(candidate, options.evidenceRevision, options.surfaceRevision) &&
      options.availableCapabilityNames.has(candidate.capabilityName) &&
      targetsAreCurrent(candidate, ids),
    )
    .filter((candidate) => {
      const key = continuationKey(candidate);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => reasonPriority[left.reasonCode] - reasonPriority[right.reasonCode] || left.capabilityName.localeCompare(right.capabilityName) || continuationKey(left).localeCompare(continuationKey(right)))
    .slice(0, limit);
}
