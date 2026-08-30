import type { AgentCapability, CapabilityExecutionOptions } from "../capability.js";
import type { AgentContext, EvidenceMeta, ReviewRevisionDelta, ReviewUseCasePackets } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { buildGetChallengeOutput } from "./get-challenge.js";
import { buildGetSessionFocusOutput } from "./get-session-focus.js";
import { inspectComponent } from "./inspect-component.js";
import { buildGetMetricsOutput } from "./get-metrics.js";
import { getCostBreakdown } from "./get-cost-breakdown.js";
import { inspectBottlenecks } from "./inspect-bottlenecks.js";
import { REVIEWER_CONTRACT } from "../coaching-policy.js";
import { reviewCurrentDesignInputSchema, type ReviewCurrentDesignInput } from "../schemas.js";
import { createEmptyAgentSessionState, type AgentSessionFocus, type AgentSessionState, type PromptIntent } from "../session.js";
import { phase7DynamicCapabilityPredicate } from "../architecture-predicates.js";
import { PHASE_7_DYNAMIC_CAPABILITY_NAMES } from "../capability-names.js";
import {
  computeResultDigest,
  focusOnlyDelta,
  knownStateMatches,
  projectQuantitativeEvidence,
  reviewReference,
  separatePlayerAuthored,
  stripEnvelopeSourceFields,
  type KnownStateInput,
} from "../evidence-result.js";

export type ReviewCurrentDesignResult =
  | ReviewCurrentDesignOutput
  | { readonly unchanged: true }
  | { readonly focusOnly: true; readonly focus: ReturnType<typeof buildGetSessionFocusOutput>; readonly packet?: unknown };

export interface ReviewCurrentDesignOutput {
  readonly policy: { readonly version: "wmp-1"; readonly digest: string; readonly contract: readonly string[] };
  readonly focus: ReturnType<typeof buildGetSessionFocusOutput>;
  readonly evidence: EvidenceMeta & { readonly source: "live_draft_projection" | "player_run"; readonly updating: false; readonly available: boolean };
  readonly challenge: { readonly slug: string; readonly title: string; readonly budgetMonthly: number; readonly learningThemes: readonly string[] };
  readonly component?: unknown;
  readonly requirement?: unknown;
  readonly workload?: unknown;
  readonly cost?: unknown;
  readonly summary?: unknown;
  readonly suggestedNextTools: readonly { readonly name: string; readonly reason: string }[];
  readonly changeSummary?: ReviewRevisionDelta & { readonly noMaterialChange?: boolean };
  readonly deltaUnavailable?: "revision_not_retained";
  readonly reviewRef: string;
  readonly availableSections: readonly string[];
  readonly truncated: boolean;
}

const PACKET_CAP = 3;

/** Materialize bounded projections once per immutable evidence revision. */
export function buildReviewUseCasePackets(context: AgentContext): ReviewUseCasePackets {
  const simulation = context.simulation?.available === true ? context.simulation : undefined;
  const failedRequirements = (context.requirementResults ?? []).filter((requirement) => !requirement.passed).slice(0, PACKET_CAP);
  const risks = simulation ? inspectBottlenecks(context) : undefined;
  const highestImpactBottleneck = risks?.ok ? risks.data.risks[0] : undefined;
  const component: Record<string, { component: unknown; neighbors: readonly string[]; relatedRequirements: readonly typeof failedRequirements[number][] }> = {};
  for (const candidate of context.architecture.components) {
    const neighbors = context.architecture.connections
      .filter((connection) => connection.sourceComponentId === candidate.id || connection.targetComponentId === candidate.id)
      .map((connection) => connection.sourceComponentId === candidate.id ? connection.targetComponentId : connection.sourceComponentId)
      .sort((left, right) => left.localeCompare(right))
      .slice(0, PACKET_CAP);
    const inspected = inspectComponent(context, { componentId: candidate.id });
    component[candidate.id] = {
      component: "data" in inspected ? inspected.data : candidate,
      neighbors,
      relatedRequirements: failedRequirements.filter((requirement) => requirement.explanation.includes(candidate.id)),
    };
  }
  const requirement: Record<string, { result: typeof failedRequirements[number]; implicatedComponentIds: readonly string[]; caveats: readonly string[]; relatedBottlenecks: readonly unknown[] }> = {};
  for (const result of context.requirementResults ?? []) {
    const implicatedComponentIds = Object.values(simulation?.workloadPaths ?? {}).flatMap((channel) => channel.paths.filter((path) => path.status !== "complete").flatMap((path) => path.componentIds)).filter((id, index, ids) => ids.indexOf(id) === index).sort().slice(0, PACKET_CAP);
    requirement[result.id] = { result, implicatedComponentIds, caveats: result.passed ? [] : ["Status and actual values come from the deterministic simulator."], relatedBottlenecks: risks?.ok ? risks.data.risks.slice(0, PACKET_CAP) : [] };
  }
  const workload = Object.fromEntries(Object.entries(simulation?.workloadPaths ?? {}).map(([id, channel]) => [id, { channel }])) as ReviewUseCasePackets["workload"];
  const cost = getCostBreakdown(context);
  return {
    overview: { failedRequirements, ...(highestImpactBottleneck ? { highestImpactBottleneck } : {}), ...(context.cost ? { costHeadroom: context.challenge.monthlyBudget - context.cost.monthlyTotal } : {}) },
    component,
    requirement,
    workload,
    cost: { contributors: [...new Set((context.cost?.lineItems ?? []).map((line) => line.componentId))].sort().slice(0, PACKET_CAP), topContributors: cost.ok ? cost.data.lineItems.slice().sort((left, right) => right.monthlyCost - left.monthlyCost || left.componentId.localeCompare(right.componentId)).slice(0, PACKET_CAP) : [], budget: context.challenge.monthlyBudget, ...(context.cost ? { monthlyTotal: context.cost.monthlyTotal, remainingBudget: context.challenge.monthlyBudget - context.cost.monthlyTotal } : {}) },
  };
}

function ids(values: readonly { readonly id: string }[]): Set<string> { return new Set(values.map((value) => value.id)); }
function dynamicCapabilities(context: AgentContext): Set<string> {
  return new Set(PHASE_7_DYNAMIC_CAPABILITY_NAMES.filter((name) => phase7DynamicCapabilityPredicate(name, context.architecture)));
}

export function buildReviewRevisionDelta(previous: AgentContext, current: AgentContext): ReviewRevisionDelta {
  const previousComponents = ids(previous.architecture.components);
  const currentComponents = ids(current.architecture.components);
  const componentById = (context: AgentContext, id: string) => context.architecture.components.find((component) => component.id === id);
  const semanticComponent = (context: AgentContext, id: string) => {
    const component = componentById(context, id);
    if (!component) return undefined;
    const { ui: _ui, ...domainComponent } = component;
    return domainComponent;
  };
  const changedComponentIds = [...currentComponents].filter((id) => previousComponents.has(id) && JSON.stringify(semanticComponent(previous, id)) !== JSON.stringify(semanticComponent(current, id))).sort();
  const previousConnections = ids(previous.architecture.connections);
  const currentConnections = ids(current.architecture.connections);
  const changedRequirementIds = [...new Set([...(previous.requirementResults ?? []), ...(current.requirementResults ?? [])].map((result) => result.id))].filter((id) => JSON.stringify(previous.requirementResults?.find((result) => result.id === id)) !== JSON.stringify(current.requirementResults?.find((result) => result.id === id))).sort();
  const metricDeltas = changedComponentIds.flatMap((componentId) => { const before = previous.simulation?.available ? previous.simulation.components[componentId]?.metrics : undefined; const after = current.simulation?.available ? current.simulation.components[componentId]?.metrics : undefined; return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort().filter((metric) => before?.[metric] !== after?.[metric]).map((metric) => ({ componentId, metric, ...(before?.[metric] !== undefined ? { from: before[metric] } : {}), ...(after?.[metric] !== undefined ? { to: after[metric] } : {}) })); });
  const previousWorkload = previous.simulation?.available ? previous.simulation.workloadPaths ?? {} : {};
  const currentWorkload = current.simulation?.available ? current.simulation.workloadPaths ?? {} : {};
  const changedWorkloadChannelIds = [...new Set([...Object.keys(previousWorkload), ...Object.keys(currentWorkload)])].filter((id) => JSON.stringify(previousWorkload[id]) !== JSON.stringify(currentWorkload[id])).sort();
  const beforeDynamic = dynamicCapabilities(previous); const afterDynamic = dynamicCapabilities(current);
  const unchangedCriticalCaveats = ["Evidence is a live-draft projection; it is not a player Run.", ...(current.simulation?.available === false ? ["Simulator evidence is unavailable for the current revision."] : [])];
  return {
    fromRevision: previous.evidenceMeta?.architectureRevision ?? "unversioned",
    toRevision: current.evidenceMeta?.architectureRevision ?? "unversioned",
    addedComponentIds: [...currentComponents].filter((id) => !previousComponents.has(id)).sort(), removedComponentIds: [...previousComponents].filter((id) => !currentComponents.has(id)).sort(), changedComponentIds,
    addedConnectionIds: [...currentConnections].filter((id) => !previousConnections.has(id)).sort(), removedConnectionIds: [...previousConnections].filter((id) => !currentConnections.has(id)).sort(), changedRequirementIds, metricDeltas,
    ...(previous.cost && current.cost ? { costDelta: { monthlyTotal: current.cost.monthlyTotal, amount: current.cost.monthlyTotal - previous.cost.monthlyTotal } } : {}),
    changedWorkloadChannelIds,
    ...(changedWorkloadChannelIds[0] ? { firstChangedConstrainedHop: currentWorkload[changedWorkloadChannelIds[0]]?.paths.find((path) => path.status !== "complete")?.pathId } : {}),
    dynamicCapabilitiesAdded: [...afterDynamic].filter((name) => !beforeDynamic.has(name)).sort(), dynamicCapabilitiesRemoved: [...beforeDynamic].filter((name) => !afterDynamic.has(name)).sort(), unchangedCriticalCaveats,
  };
}

function digest(value: string): string { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }
function sessionFrom(options?: CapabilityExecutionOptions): AgentSessionState { return options?.session ?? createEmptyAgentSessionState(); }

function reviewOutputDigest(output: ReviewCurrentDesignOutput): string {
  const stripped = stripEnvelopeSourceFields(output as unknown as Record<string, unknown>);
  const projected = projectQuantitativeEvidence(separatePlayerAuthored("review_current_design", stripped));
  return computeResultDigest(projected);
}

function currentKnownState(
  context: AgentContext,
  output: ReviewCurrentDesignOutput,
  session: AgentSessionState,
  surfaceRevision: string,
): KnownStateInput {
  return {
    evidenceRevision: context.evidenceMeta?.architectureRevision ?? "unversioned",
    sessionRevision: session.revision,
    surfaceRevision,
    resultDigest: reviewOutputDigest(output),
  };
}

function applyKnownState(
  context: AgentContext,
  output: ReviewCurrentDesignOutput,
  input: ReviewCurrentDesignInput,
  session: AgentSessionState,
  surfaceRevision: string,
): ReviewCurrentDesignOutput | { readonly unchanged: true } | { readonly focusOnly: true; readonly focus: ReturnType<typeof buildGetSessionFocusOutput>; readonly packet?: unknown } {
  const known = input.knownState;
  if (!known) return output;
  const current = currentKnownState(context, output, session, surfaceRevision);
  if (knownStateMatches(known, current)) return { unchanged: true };
  if (focusOnlyDelta(known, current)) {
    const packet = output.component ?? output.requirement ?? output.workload ?? output.cost ?? output.summary;
    return { focusOnly: true, focus: output.focus, ...(packet !== undefined ? { packet } : {}) };
  }
  return output;
}
function intentFor(input: ReviewCurrentDesignInput, session: AgentSessionState): PromptIntent | "auto" {
  if (input.intent && input.intent !== "auto") return input.intent;
  return session.pendingHelpRequest?.promptIntent ?? (session.focus.kind === "component" ? "component_review" : session.focus.kind === "requirement" ? "requirement_failure" : session.focus.kind === "workload_channel" ? "workload_trace" : "auto");
}
function targetError(intent: string, targetId: string | undefined): CapabilityResult<never> | undefined {
  if (intent === "cost_review" && targetId) return capabilityError("INVALID_INPUT", "cost_review does not accept targetId.");
  return undefined;
}
function suggested(name: string, reason: string): { name: string; reason: string } { return { name, reason }; }

export function buildReviewCurrentDesignOutput(context: AgentContext, input: ReviewCurrentDesignInput, session: AgentSessionState, surfaceRevision = "unversioned"): CapabilityResult<ReviewCurrentDesignResult> {
  const focus = buildGetSessionFocusOutput(context, session);
  const intent = intentFor(input, session);
  const invalidTarget = targetError(intent, input.targetId);
  if (invalidTarget) return invalidTarget;
  const knownRevision = input.knownEvidenceRevision;
  const currentRevision = context.evidenceMeta?.architectureRevision;
  if (knownRevision && knownRevision === currentRevision) return capabilityOk({ policy: { version: "wmp-1", digest: digest(REVIEWER_CONTRACT.prohibitedActions.join("|")), contract: ["Use simulator evidence as truth.", "Give one finding and one focused question.", "Do not mutate architecture or invent metrics."] }, focus, evidence: { ...(context.evidenceMeta ?? { architectureRevision: "unversioned", simulationRunId: "unversioned", simulatorVersion: "unknown", isStale: true, generatedAt: "unknown" }), source: "live_draft_projection", updating: false, available: context.simulation?.available === true }, challenge: { slug: context.challenge.slug, title: context.challenge.title, budgetMonthly: context.challenge.monthlyBudget, learningThemes: context.challenge.coachingPolicy?.focusThemes ?? [] }, reviewRef: reviewReference(context, intent, input.targetId), availableSections: ["causal_chain", "topology_neighborhood", "requirement_evidence", "workload_hops", "cost_contributors", "comparison_baseline", "experiment_readiness"], truncated: false, changeSummary: { ...(context.reviewDelta ?? { fromRevision: currentRevision ?? "unversioned", toRevision: currentRevision ?? "unversioned", addedComponentIds: [], removedComponentIds: [], changedComponentIds: [], addedConnectionIds: [], removedConnectionIds: [], changedRequirementIds: [], metricDeltas: [], changedWorkloadChannelIds: [], dynamicCapabilitiesAdded: [], dynamicCapabilitiesRemoved: [], unchangedCriticalCaveats: [] }), noMaterialChange: true }, suggestedNextTools: [] });
  const deltaUnavailable = knownRevision ? (context.reviewDelta?.fromRevision === knownRevision ? undefined : "revision_not_retained" as const) : undefined;
  const evidenceMeta = context.evidenceMeta ?? { architectureRevision: "unversioned", simulationRunId: "unversioned", simulatorVersion: "unknown", isStale: true, generatedAt: "unknown" };
  const evidence = { ...evidenceMeta, source: evidenceMeta.simulationRunId.startsWith("live-") ? "live_draft_projection" as const : "player_run" as const, updating: false as const, available: context.simulation?.available === true };
  const failed = (context.requirementResults ?? []).filter((requirement) => !requirement.passed).slice(0, 3);
  const common = { policy: { version: "wmp-1" as const, digest: digest(REVIEWER_CONTRACT.prohibitedActions.join("|")), contract: ["Use simulator evidence as truth.", "Give one finding and one focused question.", "Do not mutate architecture or invent metrics."] }, focus, evidence, challenge: { slug: context.challenge.slug, title: context.challenge.title, budgetMonthly: context.challenge.monthlyBudget, learningThemes: context.challenge.coachingPolicy?.focusThemes ?? [] }, reviewRef: reviewReference(context, intent, input.targetId), availableSections: ["causal_chain", "topology_neighborhood", "requirement_evidence", "workload_hops", "cost_contributors", "comparison_baseline", "experiment_readiness"], truncated: false, ...(context.reviewDelta && !deltaUnavailable ? { changeSummary: context.reviewDelta } : {}), ...(deltaUnavailable ? { deltaUnavailable } : {}) };
  if (intent === "component_review") {
    const id = input.targetId ?? (focus.focus.kind === "component" ? focus.focus.componentId : session.pendingHelpRequest?.componentId);
    if (!id || !context.architecture.components.some((component) => component.id === id)) return capabilityError("INVALID_INPUT", "component_review targetId must name a current component.");
    const component = context.reviewPackets?.component[id]?.component ? capabilityOk(context.reviewPackets.component[id]!.component) : inspectComponent(context, { componentId: id });
    const packet = context.reviewPackets?.component[id];
    const built = capabilityOk({ ...common, component: component.ok ? { ...component.data, neighbors: packet?.neighbors ?? [], requirementStatus: packet?.relatedRequirements ?? failed.filter((requirement) => requirement.explanation.includes(id)) } : component, suggestedNextTools: [suggested("get_metrics", "Compare this component with system outcomes."), suggested("estimate_capacity", "Explain capacity evidence if the component is under pressure.")] });
    return built.ok ? capabilityOk(applyKnownState(context, built.data, input, session, surfaceRevision)) : built;
  }
  if (intent === "requirement_failure") {
    const id = input.targetId ?? (focus.focus.kind === "requirement" ? focus.focus.requirementId : session.pendingHelpRequest?.requirementId) ?? failed[0]?.id;
    const packetRequirement = id ? context.reviewPackets?.requirement[id] : undefined;
    const fallbackRequirement = context.requirementResults?.find((candidate) => candidate.id === id);
    const requirement = packetRequirement ?? (fallbackRequirement ? { result: fallbackRequirement, implicatedComponentIds: [], caveats: [], relatedBottlenecks: [] } : undefined);
    if (!requirement) return capabilityError("INVALID_INPUT", "requirement_failure targetId must name a current simulator requirement.");
    const risks = context.reviewPackets ? { ok: true as const, data: { risks: requirement.relatedBottlenecks } } : inspectBottlenecks(context);
    const built = capabilityOk({ ...common, requirement: { ...requirement.result, implicatedComponentIds: requirement.implicatedComponentIds, caveats: requirement.caveats, relatedBottlenecks: risks.ok ? risks.data.risks.slice(0, 3) : [] }, suggestedNextTools: [suggested("inspect_bottlenecks", "Trace the simulator-reported risks behind this result."), suggested("get_metrics", "Read the compact system outcomes.")] });
    return built.ok ? capabilityOk(applyKnownState(context, built.data, input, session, surfaceRevision)) : built;
  }
  if (intent === "workload_trace") {
    const id = input.targetId ?? (focus.focus.kind === "workload_channel" ? focus.focus.workloadChannelId : session.pendingHelpRequest?.workloadChannelId);
    const channel = id ? context.reviewPackets?.workload[id]?.channel ?? (context.simulation?.available === true ? context.simulation.workloadPaths?.[id] : undefined) : undefined;
    if (!id || !channel) return capabilityError("INVALID_INPUT", "workload_trace targetId must name a current workload channel.");
    const built = capabilityOk({ ...common, workload: { channelId: id, paths: channel.paths, verifiedComponentIds: [...new Set(channel.paths.flatMap((path) => path.componentIds))].sort(), verifiedConnectionIds: [...new Set(channel.paths.flatMap((path) => path.connectionIds))].sort() }, suggestedNextTools: [suggested("inspect_design_entity", "Inspect a verified component or connection on this path."), suggested("get_metrics", "Compare path evidence with system outcomes.")] });
    return built.ok ? capabilityOk(applyKnownState(context, built.data, input, session, surfaceRevision)) : built;
  }
  if (intent === "cost_review") {
    let built: CapabilityResult<ReviewCurrentDesignOutput>;
    if (context.reviewPackets) built = capabilityOk({ ...common, cost: { monthlyTotal: context.reviewPackets.cost.monthlyTotal ?? 0, budget: context.reviewPackets.cost.budget, overBudget: (context.reviewPackets.cost.monthlyTotal ?? 0) > context.reviewPackets.cost.budget, topContributors: context.reviewPackets.cost.topContributors }, suggestedNextTools: [suggested("inspect_design_entity", "Connect the largest deterministic contributor to system evidence."), suggested("get_metrics", "Check whether cost pressure aligns with observed behavior.")] });
    else {
      const cost = getCostBreakdown(context);
      built = cost.ok ? capabilityOk({ ...common, cost: { monthlyTotal: cost.data.monthlyTotal, budget: cost.data.budget, overBudget: cost.data.overBudget, topContributors: cost.data.lineItems.slice().sort((a, b) => b.monthlyCost - a.monthlyCost || a.componentId.localeCompare(b.componentId)).slice(0, 3) }, suggestedNextTools: [suggested("inspect_design_entity", "Connect the largest deterministic contributor to system evidence."), suggested("get_metrics", "Check whether cost pressure aligns with observed behavior.")] }) : cost;
    }
    return built.ok ? capabilityOk(applyKnownState(context, built.data, input, session, surfaceRevision)) : built;
  }
  const built = capabilityOk({ ...common, summary: { system: context.simulation?.available === true ? context.simulation.system : undefined, failedRequirements: failed }, suggestedNextTools: [suggested("get_metrics", "Read current system outcomes."), suggested("get_requirements", "Review configured success criteria.")] });
  return built.ok ? capabilityOk(applyKnownState(context, built.data, input, session, surfaceRevision)) : built;
}

export const reviewCurrentDesignCapability: AgentCapability<AgentContext, ReviewCurrentDesignInput, CapabilityResult<ReviewCurrentDesignResult>> = {
  name: "review_current_design",
  description: "Review the current design once using live focus and simulator evidence. Returns one compact grounded finding context; use targeted reads only when needed.",
  inputSchema: reviewCurrentDesignInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute(context, input, options) {
    return buildReviewCurrentDesignOutput(context, input, sessionFrom(options), options?.surfaceRevision ?? "unversioned");
  },
};
