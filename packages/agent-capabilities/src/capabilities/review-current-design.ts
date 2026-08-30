import type { AgentCapability, CapabilityExecutionOptions } from "../capability.js";
import type { AgentContext, EvidenceMeta } from "../context.js";
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
}

function digest(value: string): string { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }
function sessionFrom(options?: CapabilityExecutionOptions): AgentSessionState { return options?.session ?? createEmptyAgentSessionState(); }
function intentFor(input: ReviewCurrentDesignInput, session: AgentSessionState): PromptIntent | "auto" {
  if (input.intent && input.intent !== "auto") return input.intent;
  return session.pendingHelpRequest?.promptIntent ?? (session.focus.kind === "component" ? "component_review" : session.focus.kind === "requirement" ? "requirement_failure" : session.focus.kind === "workload_channel" ? "workload_trace" : "auto");
}
function targetError(intent: string, targetId: string | undefined): CapabilityResult<never> | undefined {
  if (intent === "cost_review" && targetId) return capabilityError("INVALID_INPUT", "cost_review does not accept targetId.");
  return undefined;
}
function suggested(name: string, reason: string): { name: string; reason: string } { return { name, reason }; }

export function buildReviewCurrentDesignOutput(context: AgentContext, input: ReviewCurrentDesignInput, session: AgentSessionState): CapabilityResult<ReviewCurrentDesignOutput> {
  const focus = buildGetSessionFocusOutput(context, session);
  const intent = intentFor(input, session);
  const invalidTarget = targetError(intent, input.targetId);
  if (invalidTarget) return invalidTarget;
  const evidenceMeta = context.evidenceMeta ?? { architectureRevision: "unversioned", simulationRunId: "unversioned", simulatorVersion: "unknown", isStale: true, generatedAt: "unknown" };
  const evidence = { ...evidenceMeta, source: evidenceMeta.simulationRunId.startsWith("live-") ? "live_draft_projection" as const : "player_run" as const, updating: false as const, available: context.simulation?.available === true };
  const failed = (context.requirementResults ?? []).filter((requirement) => !requirement.passed).slice(0, 3);
  const common = { policy: { version: "wmp-1" as const, digest: digest(REVIEWER_CONTRACT.prohibitedActions.join("|")), contract: ["Use simulator evidence as truth.", "Give one finding and one focused question.", "Do not mutate architecture or invent metrics."] }, focus, evidence, challenge: { slug: context.challenge.slug, title: context.challenge.title, budgetMonthly: context.challenge.monthlyBudget, learningThemes: context.challenge.coachingPolicy?.focusThemes ?? [] } };
  if (intent === "component_review") {
    const id = input.targetId ?? (focus.focus.kind === "component" ? focus.focus.componentId : session.pendingHelpRequest?.componentId);
    if (!id || !context.architecture.components.some((component) => component.id === id)) return capabilityError("INVALID_INPUT", "component_review targetId must name a current component.");
    const component = inspectComponent(context, { componentId: id });
    return capabilityOk({ ...common, component: component.ok ? { ...component.data, requirementStatus: failed.filter((requirement) => requirement.explanation.includes(id)) } : component, suggestedNextTools: [suggested("get_metrics", "Compare this component with system outcomes."), suggested("estimate_capacity", "Explain capacity evidence if the component is under pressure.")] });
  }
  if (intent === "requirement_failure") {
    const id = input.targetId ?? (focus.focus.kind === "requirement" ? focus.focus.requirementId : session.pendingHelpRequest?.requirementId) ?? failed[0]?.id;
    const requirement = context.requirementResults?.find((candidate) => candidate.id === id);
    if (!requirement) return capabilityError("INVALID_INPUT", "requirement_failure targetId must name a current simulator requirement.");
    const risks = inspectBottlenecks(context);
    return capabilityOk({ ...common, requirement: { ...requirement, relatedBottlenecks: risks.ok ? risks.data.risks.slice(0, 3) : [] }, suggestedNextTools: [suggested("inspect_bottlenecks", "Trace the simulator-reported risks behind this result."), suggested("get_metrics", "Read the compact system outcomes.")] });
  }
  if (intent === "workload_trace") {
    const id = input.targetId ?? (focus.focus.kind === "workload_channel" ? focus.focus.workloadChannelId : session.pendingHelpRequest?.workloadChannelId);
    const channel = id ? context.simulation?.available === true ? context.simulation.workloadPaths?.[id] : undefined : undefined;
    if (!id || !channel) return capabilityError("INVALID_INPUT", "workload_trace targetId must name a current workload channel.");
    return capabilityOk({ ...common, workload: { channelId: id, paths: channel.paths, verifiedComponentIds: [...new Set(channel.paths.flatMap((path) => path.componentIds))].sort(), verifiedConnectionIds: [...new Set(channel.paths.flatMap((path) => path.connectionIds))].sort() }, suggestedNextTools: [suggested("inspect_component", "Inspect a verified component on this path."), suggested("get_metrics", "Compare path evidence with system outcomes.")] });
  }
  if (intent === "cost_review") {
    const cost = getCostBreakdown(context);
    return cost.ok ? capabilityOk({ ...common, cost: { monthlyTotal: cost.data.monthlyTotal, budget: cost.data.budget, overBudget: cost.data.overBudget, topContributors: cost.data.lineItems.slice().sort((a, b) => b.monthlyCost - a.monthlyCost || a.componentId.localeCompare(b.componentId)).slice(0, 3) }, suggestedNextTools: [suggested("inspect_component", "Connect the largest deterministic contributor to system evidence."), suggested("get_metrics", "Check whether cost pressure aligns with observed behavior.")] }) : cost;
  }
  return capabilityOk({ ...common, summary: { system: context.simulation?.available === true ? context.simulation.system : undefined, failedRequirements: failed }, suggestedNextTools: [suggested("get_metrics", "Read current system outcomes."), suggested("get_requirements", "Review configured success criteria.")] });
}

export const reviewCurrentDesignCapability: AgentCapability<AgentContext, ReviewCurrentDesignInput, CapabilityResult<ReviewCurrentDesignOutput>> = {
  name: "review_current_design",
  description: "Review the current design once using live focus and simulator evidence. Returns one compact grounded finding context; use targeted reads only when needed.",
  inputSchema: reviewCurrentDesignInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute(context, input, options) { return buildReviewCurrentDesignOutput(context, input, sessionFrom(options)); },
};
