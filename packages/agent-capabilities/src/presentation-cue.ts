import type { EntityKind } from "./evidence-result.js";
import { createScopedEntityReference, resolveEntityTarget } from "./evidence-result.js";
import type { AgentContext } from "./context.js";

/** Versioned, adapter-neutral presentation guidance. It is never simulator truth. */
export const PRESENTATION_CUE_CONTRACT_VERSION = "presentation-1" as const;

export type PresentationCueKind = "spotlight" | "path";
export type PresentationEmphasis = "primary" | "secondary";
export type PresentationCameraIntent = "none" | "frame-primary" | "frame-path";
export type PresentationReasonCode =
  | "finding"
  | "error-location"
  | "causal-path"
  | "comparison-delta";

export interface PresentationTarget {
  readonly ref: string;
  readonly kind: EntityKind;
  readonly entityId: string;
  readonly evidenceRevision: string;
  readonly emphasis: PresentationEmphasis;
}

export interface PresentationCue {
  readonly contractVersion: typeof PRESENTATION_CUE_CONTRACT_VERSION;
  readonly kind: PresentationCueKind;
  readonly targets: readonly PresentationTarget[];
  readonly reason?: PresentationReasonCode;
  readonly camera?: PresentationCameraIntent;
}

export type PresentationTargetCandidates = Partial<Record<EntityKind, readonly string[]>>;

export interface PresentationCueInput {
  readonly kind: PresentationCueKind;
  readonly targets: readonly string[];
  readonly primaryTarget?: string;
  readonly reason?: PresentationReasonCode;
  readonly camera?: PresentationCameraIntent;
}

export const PRESENTATION_PATH_TARGET_CAP = 5;

/** Build a cue only from current evidence targets. Unknown/stale targets are omitted. */
export function createPresentationCue(
  input: PresentationCueInput,
  evidenceRevision: string,
  candidates: PresentationTargetCandidates,
): PresentationCue | undefined {
  const seen = new Set<string>();
  const targets: PresentationTarget[] = [];

  let componentCount = 0;
  let connectionCount = 0;
  for (const target of input.targets) {
    const resolved = resolveEntityTarget(target, evidenceRevision, candidates as Record<EntityKind, readonly string[]>);
    if (!resolved) continue;
    if (input.kind === "path" && resolved.kind === "component" && componentCount >= PRESENTATION_PATH_TARGET_CAP) continue;
    if (input.kind === "path" && resolved.kind === "connection" && connectionCount >= PRESENTATION_PATH_TARGET_CAP) continue;
    const reference = createScopedEntityReference(resolved.kind, resolved.entityId, evidenceRevision);
    if (seen.has(reference.ref)) continue;
    seen.add(reference.ref);
    if (resolved.kind === "component") componentCount += 1;
    if (resolved.kind === "connection") connectionCount += 1;
    targets.push({
      ...reference,
      emphasis: target === input.primaryTarget ? "primary" : "secondary",
    });
  }

  if (targets.length === 0) return undefined;
  if (!targets.some((target) => target.emphasis === "primary")) {
    targets[0] = { ...targets[0], emphasis: "primary" };
  }

  return {
    contractVersion: PRESENTATION_CUE_CONTRACT_VERSION,
    kind: input.kind,
    targets,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.camera ? { camera: input.camera } : {}),
  };
}

export function validatePresentationCue(value: unknown, evidenceRevision?: string): value is PresentationCue {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.contractVersion !== PRESENTATION_CUE_CONTRACT_VERSION) return false;
  if (record.kind !== "spotlight" && record.kind !== "path") return false;
  if (!Array.isArray(record.targets) || record.targets.length === 0) return false;
  if (record.reason !== undefined && !["finding", "error-location", "causal-path", "comparison-delta"].includes(record.reason as string)) return false;
  if (record.camera !== undefined && !["none", "frame-primary", "frame-path"].includes(record.camera as string)) return false;

  const refs = new Set<string>();
  let primaryCount = 0;
  for (const target of record.targets) {
    if (typeof target !== "object" || target === null) return false;
    const entry = target as Record<string, unknown>;
    if (
      typeof entry.ref !== "string" ||
      typeof entry.kind !== "string" ||
      typeof entry.entityId !== "string" ||
      typeof entry.evidenceRevision !== "string" ||
      (entry.emphasis !== "primary" && entry.emphasis !== "secondary")
    ) return false;
    if (evidenceRevision !== undefined && entry.evidenceRevision !== evidenceRevision) return false;
    if (refs.has(entry.ref)) return false;
    refs.add(entry.ref);
    if (entry.emphasis === "primary") primaryCount += 1;
  }
  return primaryCount === 1;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Derive the default cue from structured capability evidence, never from prose. */
export function presentationCueForCapability(
  capabilityName: string,
  data: unknown,
  context: AgentContext,
  input?: unknown,
): PresentationCue | undefined {
  const record = recordValue(data);
  const request = recordValue(input);
  const evidenceRevision = context.evidenceMeta?.architectureRevision ?? "unversioned";
  if (!record) return undefined;

  let kind: PresentationCueKind = "spotlight";
  let reason: PresentationReasonCode = "finding";
  let camera: PresentationCameraIntent | undefined;
  let targets: string[] = [];
  let primaryTarget: string | undefined;

  if (capabilityName === "inspect_component") {
    const facts = recordValue(record.facts) ?? record;
    const componentId = stringValue(facts.id) ?? stringValue(facts.componentId);
    if (componentId) {
      targets = [componentId];
      primaryTarget = componentId;
    }
  } else if (capabilityName === "inspect_design_entity") {
    const entityId = stringValue(record.entityId) ?? stringValue(request?.ref);
    if (entityId) {
      targets = [entityId];
      primaryTarget = entityId;
      if (record.kind === "connection") {
        kind = "path";
        reason = "causal-path";
        const source = stringValue(record.sourceComponentId);
        const target = stringValue(record.targetComponentId);
        targets = [entityId, ...[source, target].filter((value): value is string => value !== undefined)];
        primaryTarget = source ?? target ?? entityId;
      } else if (record.kind === "requirement") {
        reason = "error-location";
        const implicated = Array.isArray(record.implicatedComponentIds)
          ? record.implicatedComponentIds.filter((value): value is string => typeof value === "string")
          : [];
        targets = implicated;
        primaryTarget = targets[0];
      } else if (record.kind === "workload") {
        const channel = recordValue(record.channel);
        const paths = Array.isArray(channel?.paths) ? channel.paths.map(recordValue).filter((value): value is Record<string, unknown> => value !== undefined) : [];
        const firstPath = paths[0];
        const componentIds = Array.isArray(firstPath?.componentIds) ? firstPath.componentIds.filter((value): value is string => typeof value === "string") : [];
        const connectionIds = Array.isArray(firstPath?.connectionIds) ? firstPath.connectionIds.filter((value): value is string => typeof value === "string") : [];
        kind = "path";
        reason = "causal-path";
        targets = [...componentIds, ...connectionIds];
        primaryTarget = componentIds[0];
      }
    }
  } else if (capabilityName === "review_current_design") {
    const focusEnvelope = recordValue(record.focus);
    const focus = recordValue(focusEnvelope?.focus) ?? focusEnvelope;
    const componentId = stringValue(focus?.componentId);
    const requirementId = stringValue(focus?.requirementId);
    const workloadChannelId = stringValue(focus?.workloadChannelId);
    const component = recordValue(record.component);
    const cost = recordValue(record.cost);
    const topContributor = Array.isArray(cost?.topContributors) ? recordValue(cost.topContributors[0]) : undefined;
    const workload = recordValue(record.workload);
    const summary = recordValue(record.summary);
    const failedRequirements = Array.isArray(summary?.failedRequirements)
      ? summary.failedRequirements.map((value) => recordValue(value)).filter((value): value is Record<string, unknown> => value !== undefined)
      : [];
    const firstFailedRequirementId = stringValue(failedRequirements[0]?.id);
    const verifiedComponents = Array.isArray(workload?.verifiedComponentIds)
      ? workload.verifiedComponentIds.filter((value): value is string => typeof value === "string")
      : [];
    const requestedIntent = stringValue(request?.intent);
    const requestedTarget = stringValue(request?.targetId);
    const requestedRequirement = requestedIntent === "requirement_failure"
      ? requestedTarget ?? (context.requirementResults ?? []).find((result) => !result.passed)?.id
      : undefined;
    const requestedWorkload = requestedIntent === "workload_trace" ? requestedTarget : undefined;
    const requestedComponent = requestedIntent === "component_review" ? requestedTarget : undefined;
    if (requestedComponent) {
      targets = [requestedComponent];
      primaryTarget = requestedComponent;
    } else if (requestedWorkload) {
      const channel = context.simulation?.available === true ? context.simulation.workloadPaths?.[requestedWorkload] : undefined;
      const path = channel?.paths.find((candidate) => candidate.status !== "complete") ?? channel?.paths[0];
      kind = "path";
      reason = "causal-path";
      targets = path ? [...path.componentIds, ...path.connectionIds] : [];
      primaryTarget = path?.componentIds[0];
    } else if (requestedRequirement) {
      reason = "error-location";
      const packet = context.reviewPackets?.requirement[requestedRequirement];
      const failedPath = Object.values(context.simulation?.available === true ? context.simulation.workloadPaths ?? {} : {})
        .flatMap((channel) => channel.paths)
        .find((path) => path.status !== "complete");
      targets = packet?.implicatedComponentIds.length
        ? [...packet.implicatedComponentIds, ...(failedPath?.connectionIds ?? [])]
        : failedPath
          ? [...failedPath.componentIds, ...failedPath.connectionIds]
          : [];
      primaryTarget = targets[0];
    } else if (componentId) {
      targets = [componentId];
      primaryTarget = componentId;
    } else if (component && stringValue(component.id)) {
      targets = [stringValue(component.id)!];
      primaryTarget = targets[0];
    } else if (verifiedComponents.length > 0 || workloadChannelId) {
      kind = "path";
      reason = "causal-path";
      targets = verifiedComponents;
      primaryTarget = targets[0];
    } else if (requirementId || firstFailedRequirementId || (context.requirementResults ?? []).some((result) => !result.passed)) {
      reason = "error-location";
      const fallbackFailedRequirementId = firstFailedRequirementId ?? (context.requirementResults ?? []).find((result) => !result.passed)?.id;
      const requirement = recordValue(record.requirement) ?? (fallbackFailedRequirementId
        ? recordValue(context.reviewPackets?.requirement[fallbackFailedRequirementId])
        : undefined);
      const implicated = Array.isArray(requirement?.implicatedComponentIds)
        ? requirement.implicatedComponentIds.filter((value): value is string => typeof value === "string")
        : [];
      const failedPaths = Object.values(context.simulation?.available === true ? context.simulation.workloadPaths ?? {} : {})
        .flatMap((channel) => channel.paths.filter((path) => path.status !== "complete"));
      const failedPathComponents = failedPaths.flatMap((path) => path.componentIds);
      const failedPathConnections = failedPaths.flatMap((path) => path.connectionIds);
      targets = implicated.length > 0
        ? [...implicated, ...failedPathConnections]
        : failedPathComponents.length > 0
          ? [...new Set([...failedPathComponents, ...failedPathConnections])]
          : requirementId
            ? [requirementId]
            : [];
      primaryTarget = targets[0];
    } else if (topContributor?.componentId && typeof topContributor.componentId === "string") {
      targets = [topContributor.componentId];
      primaryTarget = topContributor.componentId;
    }
  } else if (capabilityName === "compare_design_evidence") {
    const changes = recordValue(record.changes);
    const changed = Array.isArray(changes?.changedComponentIds)
      ? changes.changedComponentIds.filter((value): value is string => typeof value === "string")
      : [];
    if (changed.length > 0) {
      kind = "path";
      reason = "comparison-delta";
      targets = changed;
      primaryTarget = changed[0];
    }
  } else if (capabilityName === "inspect_cache" || capabilityName === "inspect_replication") {
    const componentId = stringValue(record.componentId);
    if (componentId) {
      targets = [componentId];
      primaryTarget = componentId;
    }
  } else if (capabilityName === "estimate_capacity") {
    const componentId = stringValue(record.componentId) ?? stringValue(recordValue(record.bottleneck)?.componentId);
    const components = Array.isArray(record.components)
      ? record.components.map(recordValue).map((entry) => stringValue(entry?.componentId)).filter((value): value is string => value !== undefined)
      : [];
    targets = componentId ? [componentId] : components;
    primaryTarget = targets[0];
  } else if (capabilityName === "get_cost_breakdown") {
    const lineItems = Array.isArray(record.lineItems) ? record.lineItems.map(recordValue) : [];
    targets = lineItems.map((item) => stringValue(item?.componentId)).filter((value): value is string => value !== undefined);
    primaryTarget = targets[0];
  } else if (capabilityName === "get_metrics") {
    const components = Array.isArray(record.components) ? record.components.map(recordValue) : [];
    targets = components.map((item) => stringValue(item?.id)).filter((value): value is string => value !== undefined);
    primaryTarget = targets[0];
  } else if (capabilityName === "inspect_bottlenecks") {
    const risks = Array.isArray(record.risks) ? record.risks.map(recordValue) : [];
    targets = risks.map((item) => stringValue(item?.componentId)).filter((value): value is string => value !== undefined);
    primaryTarget = targets[0];
  } else if (capabilityName === "run_load_test" || capabilityName === "flush_cache" || capabilityName === "inject_component_failure" || capabilityName === "inject_region_failure") {
    const affected = Array.isArray(record.affectedEntityRefs) ? record.affectedEntityRefs : [];
    targets = affected.flatMap((value) => {
      const entry = recordValue(value);
      return [stringValue(entry?.entityId) ?? stringValue(entry?.ref)].filter((item): item is string => item !== undefined);
    });
    primaryTarget = targets[0];
  }

  if (targets.length === 0) return undefined;
  const componentIds = new Set(context.architecture.components.map((component) => component.id));
  const connectionIds = new Set(context.architecture.connections.map((connection) => connection.id));
  const resolvedComponentCount = new Set(targets.filter((target) => componentIds.has(target))).size;
  const resolvedConnectionCount = new Set(targets.filter((target) => connectionIds.has(target))).size;
  if (resolvedComponentCount + resolvedConnectionCount === 0) return undefined;
  if (resolvedComponentCount + resolvedConnectionCount > 1) kind = "path";
  camera = kind === "path" ? "frame-path" : "frame-primary";
  return createPresentationCue({ kind, targets, primaryTarget, reason, camera }, evidenceRevision, {
    component: context.architecture.components.map((component) => component.id),
    connection: context.architecture.connections.map((connection) => connection.id),
    requirement: context.requirementResults?.map((requirement) => requirement.id) ?? context.challenge.requirements.map((requirement) => requirement.id),
    region: [...new Set(context.architecture.components.flatMap((component) => component.deployments.map((deployment) => deployment.regionId)))],
    workload: Object.keys(context.simulation?.available === true ? context.simulation.workloadPaths ?? {} : {}),
  });
}
