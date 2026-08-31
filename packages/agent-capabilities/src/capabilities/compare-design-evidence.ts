import type { RequirementResult } from "@faultline/core";

import type { AgentCapability } from "../capability.js";
import { comparisonContextFromSnapshot, type AgentContext, type AgentScenarioEvidence, type ComparisonBaselines, type ComparisonSnapshot, type ReviewRevisionDelta } from "../context.js";
import { resolveInspectDesignEntityTarget } from "./inspect-design-entity.js";
import { buildReviewRevisionDelta } from "./review-current-design.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import {
  compareDesignEvidenceInputSchema,
  type CompareDesignEvidenceInput,
  type CompareDesignEvidenceScope,
} from "../schemas.js";

export type CompareBaselineKind = CompareDesignEvidenceInput["baseline"];
export type AuthoredScenarioId = "hot_key" | "processing" | "playback";

export interface ComparisonProvenanceSide {
  readonly evidenceRevision: string;
  readonly source: "live_draft_projection" | "player_run";
  readonly simulatorVersion: string;
  readonly simulationRunId: string;
}

export interface CompareDesignEvidenceOutput {
  readonly baseline: CompareBaselineKind;
  readonly scope: CompareDesignEvidenceScope;
  readonly current: ComparisonProvenanceSide;
  readonly baselineSide: ComparisonProvenanceSide;
  readonly changes: ReviewRevisionDelta | ScopedComparisonChanges | ScenarioComparisonChanges;
  readonly improvements: readonly string[];
  readonly regressions: readonly string[];
  readonly unchangedCriticalCaveats: readonly string[];
  readonly baselineUnavailable?: "not_retained" | "no_player_run" | "scenario_not_modeled";
}

export interface ScopedComparisonChanges {
  readonly targetRef?: string;
  readonly entityKind?: string;
  readonly entityId?: string;
  readonly structural?: Pick<ReviewRevisionDelta, "addedComponentIds" | "removedComponentIds" | "changedComponentIds" | "addedConnectionIds" | "removedConnectionIds">;
  readonly requirements?: readonly RequirementResult[];
  readonly metricDeltas?: ReviewRevisionDelta["metricDeltas"];
  readonly workloadChannelIds?: readonly string[];
  readonly costDelta?: ReviewRevisionDelta["costDelta"];
  readonly dynamicCapabilitiesAdded?: readonly string[];
  readonly dynamicCapabilitiesRemoved?: readonly string[];
}

export interface ScenarioComparisonChanges {
  readonly scenarioId: AuthoredScenarioId;
  readonly before?: AgentScenarioEvidence[keyof AgentScenarioEvidence];
  readonly after?: AgentScenarioEvidence[keyof AgentScenarioEvidence];
}

const BYTE_BUDGET = 4096;

function provenanceSide(context: AgentContext): ComparisonProvenanceSide {
  const meta = context.evidenceMeta ?? { architectureRevision: "unversioned", simulationRunId: "unversioned", simulatorVersion: "unknown", isStale: true, generatedAt: "unknown" };
  return {
    evidenceRevision: meta.architectureRevision,
    source: meta.simulationRunId.startsWith("live-") ? "live_draft_projection" : "player_run",
    simulatorVersion: meta.simulatorVersion,
    simulationRunId: meta.simulationRunId,
  };
}

function resolveBaselineContext(
  context: AgentContext,
  baseline: CompareBaselineKind,
  scenarioId?: string,
): { ok: true; baselineContext: AgentContext } | { ok: false; reason: CompareDesignEvidenceOutput["baselineUnavailable"] } {
  const baselines: ComparisonBaselines | undefined = context.comparisonBaselines;
  const asContext = (value: ComparisonSnapshot | AgentContext): AgentContext =>
    "challenge" in value ? value : comparisonContextFromSnapshot(value, context.challenge);
  if (baseline === "previous_review") {
    if (!baselines?.previousReview) return { ok: false, reason: "not_retained" };
    return { ok: true, baselineContext: asContext(baselines.previousReview) };
  }
  if (baseline === "last_player_run") {
    if (!baselines?.lastPlayerRun) return { ok: false, reason: "no_player_run" };
    return { ok: true, baselineContext: asContext(baselines.lastPlayerRun) };
  }
  const source = baselines?.lastPlayerRun ?? baselines?.previousReview;
  if (!source) return { ok: false, reason: "not_retained" };
  const sourceContext = asContext(source);
  if (!scenarioId || !scenarioSlice(sourceContext, scenarioId as AuthoredScenarioId) || !scenarioSlice(context, scenarioId as AuthoredScenarioId)) {
    return { ok: false, reason: "scenario_not_modeled" };
  }
  return { ok: true, baselineContext: sourceContext };
}

function scenarioSlice(context: AgentContext, scenarioId: AuthoredScenarioId): unknown {
  const scenarios = context.simulation?.available === true ? context.simulation.scenarios : undefined;
  if (!scenarios) return undefined;
  if (scenarioId === "hot_key") return scenarios.hotKey;
  if (scenarioId === "processing") return scenarios.processing;
  if (scenarioId === "playback") return scenarios.playback;
  return undefined;
}

function classifyOutcomes(
  delta: ReviewRevisionDelta,
  before: AgentContext,
  after: AgentContext,
): { improvements: string[]; regressions: string[] } {
  const improvements: string[] = [];
  const regressions: string[] = [];
  for (const requirementId of delta.changedRequirementIds) {
    const beforeResult = before.requirementResults?.find((result) => result.id === requirementId);
    const afterResult = after.requirementResults?.find((result) => result.id === requirementId);
    if (beforeResult && afterResult) {
      if (!beforeResult.passed && afterResult.passed) improvements.push(`requirement:${requirementId}:passed`);
      if (beforeResult.passed && !afterResult.passed) regressions.push(`requirement:${requirementId}:failed`);
    }
  }
  if (delta.costDelta) {
    if (delta.costDelta.amount < 0) improvements.push("cost:decreased");
    if (delta.costDelta.amount > 0) regressions.push("cost:increased");
  }
  for (const metric of delta.metricDeltas) {
    if (metric.metric.includes("headroom") && metric.from !== undefined && metric.to !== undefined && metric.to > metric.from) improvements.push(`metric:${metric.componentId}:${metric.metric}:improved`);
    if (metric.metric.includes("utilization") && metric.from !== undefined && metric.to !== undefined && metric.to < metric.from) improvements.push(`metric:${metric.componentId}:${metric.metric}:improved`);
    if (metric.metric.includes("headroom") && metric.from !== undefined && metric.to !== undefined && metric.to < metric.from) regressions.push(`metric:${metric.componentId}:${metric.metric}:worse`);
    if (metric.metric.includes("utilization") && metric.from !== undefined && metric.to !== undefined && metric.to > metric.from) regressions.push(`metric:${metric.componentId}:${metric.metric}:worse`);
  }
  return { improvements: improvements.sort(), regressions: regressions.sort() };
}

function scopeChanges(
  delta: ReviewRevisionDelta,
  scope: CompareDesignEvidenceScope,
  context: AgentContext,
  targetRef?: string,
): ReviewRevisionDelta | ScopedComparisonChanges | ScenarioComparisonChanges {
  if (scope === "system") {
    return {
      ...delta,
      metricDeltas: [...delta.metricDeltas].sort((left, right) => left.componentId.localeCompare(right.componentId) || left.metric.localeCompare(right.metric)).slice(0, 8),
    };
  }
  if (scope === "cost") {
    return {
      targetRef,
      costDelta: delta.costDelta,
      dynamicCapabilitiesAdded: delta.dynamicCapabilitiesAdded,
      dynamicCapabilitiesRemoved: delta.dynamicCapabilitiesRemoved,
    };
  }
  if (scope === "workload") {
    const channelIds = targetRef ? [targetRef] : delta.changedWorkloadChannelIds;
    return { targetRef, workloadChannelIds: channelIds.slice(0, 3) };
  }
  if (scope === "requirement") {
    const requirementIds = targetRef ? [targetRef] : delta.changedRequirementIds;
    const requirements = requirementIds
      .map((id) => context.requirementResults?.find((result) => result.id === id))
      .filter((result): result is RequirementResult => result !== undefined);
    return { targetRef, requirements };
  }
  if (scope === "entity" && targetRef) {
    const resolved = resolveEntityForComparison(context, targetRef);
    if (!resolved) {
      return { targetRef, structural: { addedComponentIds: [], removedComponentIds: [], changedComponentIds: [], addedConnectionIds: [], removedConnectionIds: [] }, metricDeltas: [] };
    }
    const { kind, entityId } = resolved;
    return {
      targetRef,
      entityKind: kind,
      entityId,
      structural: {
        addedComponentIds: kind === "component" ? delta.addedComponentIds.filter((id) => id === entityId) : [],
        removedComponentIds: kind === "component" ? delta.removedComponentIds.filter((id) => id === entityId) : [],
        changedComponentIds: kind === "component" ? delta.changedComponentIds.filter((id) => id === entityId) : [],
        addedConnectionIds: kind === "connection" ? delta.addedConnectionIds.filter((id) => id === entityId) : [],
        removedConnectionIds: kind === "connection" ? delta.removedConnectionIds.filter((id) => id === entityId) : [],
      },
      metricDeltas: kind === "component" ? delta.metricDeltas.filter((entry) => entry.componentId === entityId) : [],
      requirements: kind === "requirement" ? (context.requirementResults ?? []).filter((result) => result.id === entityId) : [],
      workloadChannelIds: kind === "workload" ? [entityId] : [],
    };
  }
  return delta;
}

function resolveEntityForComparison(
  context: AgentContext,
  targetRef: string,
): { kind: "component" | "connection" | "requirement" | "workload" | "region"; entityId: string } | undefined {
  for (const kind of ["component", "connection", "requirement", "workload", "region"] as const) {
    const resolved = resolveInspectDesignEntityTarget(kind, targetRef, context);
    if (resolved.ok) return { kind, entityId: resolved.entityId };
  }
  return undefined;
}

function buildScenarioComparison(
  baselineContext: AgentContext,
  current: AgentContext,
  scenarioId: AuthoredScenarioId,
): ScenarioComparisonChanges {
  return {
    scenarioId,
    before: scenarioSlice(baselineContext, scenarioId) as ScenarioComparisonChanges["before"],
    after: scenarioSlice(current, scenarioId) as ScenarioComparisonChanges["after"],
  };
}

export function compareDesignEvidence(
  context: AgentContext,
  input: CompareDesignEvidenceInput,
): CapabilityResult<CompareDesignEvidenceOutput> {
  if (input.baseline === "authored_scenario" && !input.scenarioId) {
    return capabilityError("INVALID_INPUT", "authored_scenario comparisons require scenarioId.");
  }
  if (input.scope === "entity" && !input.targetRef) {
    return capabilityError("INVALID_INPUT", "entity scope requires targetRef.");
  }
  if (input.scope === "requirement" && input.targetRef) {
    const resolved = resolveInspectDesignEntityTarget("requirement", input.targetRef, context);
    if (!resolved.ok && !context.requirementResults?.some((result) => result.id === input.targetRef)) {
      return capabilityError("NOT_FOUND", "targetRef must name a current requirement.", { retryable: true, recoveryTool: "review_current_design" });
    }
  }

  const resolvedBaseline = resolveBaselineContext(context, input.baseline, input.scenarioId);
  if (!resolvedBaseline.ok) {
    return capabilityError("NOT_FOUND", `Comparison baseline is unavailable (${resolvedBaseline.reason}).`, {
      retryable: true,
      recoveryTool: input.baseline === "last_player_run" ? "review_current_design" : "compare_design_evidence",
      currentEvidenceRevision: context.evidenceMeta?.architectureRevision,
    });
  }

  const baselineContext = resolvedBaseline.baselineContext;
  const scope = input.scope ?? "system";
  const delta = buildReviewRevisionDelta(baselineContext, context);
  const { improvements, regressions } = classifyOutcomes(delta, baselineContext, context);
  const changes = input.baseline === "authored_scenario" && input.scenarioId
    ? buildScenarioComparison(baselineContext, context, input.scenarioId as AuthoredScenarioId)
    : scopeChanges(delta, scope, context, input.targetRef);

  const output: CompareDesignEvidenceOutput = {
    baseline: input.baseline,
    scope,
    current: provenanceSide(context),
    baselineSide: provenanceSide(baselineContext),
    changes,
    improvements,
    regressions,
    unchangedCriticalCaveats: [
      "Current evidence is a live-draft projection unless baselineSide.source is player_run.",
      ...(context.simulation?.available === false ? ["Simulator evidence is unavailable for the current revision."] : []),
      ...(baselineContext.simulation?.available === false ? ["Simulator evidence is unavailable for the baseline revision."] : []),
    ],
  };

  if (JSON.stringify(output).length > BYTE_BUDGET) {
    return capabilityError("INVALID_INPUT", "Comparison output exceeds the bounded payload budget; narrow scope or targetRef.");
  }
  return capabilityOk(output);
}

export const compareDesignEvidenceCapability: AgentCapability<
  AgentContext,
  CompareDesignEvidenceInput,
  CapabilityResult<CompareDesignEvidenceOutput>
> = {
  name: "compare_design_evidence",
  description:
    "Compare the current live draft against a retained previous review, last player Run, or authored scenario outcome. Returns deterministic deltas only; never accepts hypothetical architectures.",
  inputSchema: compareDesignEvidenceInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context, input) {
    return compareDesignEvidence(context, input);
  },
};
