import type { AgentCapability } from "../capability.js";
import type { AgentContext, EvidenceMeta } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { expandDesignEvidenceInputSchema, type ExpandDesignEvidenceInput, type ReviewEvidenceSection } from "../schemas.js";

export interface ExpandDesignEvidenceOutput { readonly reviewRef: string; readonly sections: Readonly<Record<string, unknown>>; readonly evidence: EvidenceMeta; readonly caveats: readonly string[]; }
function digest(value: string): string { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }
export function reviewReference(context: AgentContext, intent = "auto", targetId?: string): string { return `wmp-ref-${digest(JSON.stringify({ revision: context.evidenceMeta?.architectureRevision ?? "unversioned", packet: "wmp-1", intent, target: targetId ?? "auto" }))}`; }
function referenceMatches(context: AgentContext, value: string): boolean {
  const targets = [undefined, ...context.architecture.components.map((component) => component.id), ...(context.requirementResults ?? []).map((result) => result.id), ...Object.keys(context.simulation?.available === true ? context.simulation.workloadPaths ?? {} : {})];
  return ["auto", "component_review", "requirement_failure", "workload_trace", "cost_review"].some((intent) => targets.some((target) => reviewReference(context, intent, target) === value));
}

export function expandDesignEvidence(context: AgentContext, input: ExpandDesignEvidenceInput): CapabilityResult<ExpandDesignEvidenceOutput> {
  if (!referenceMatches(context, input.reviewRef)) return capabilityError("NOT_FOUND", "This review reference is expired, mismatched, or not retained. Call review_current_design again.");
  const packets = context.reviewPackets;
  if (!packets) return capabilityError("SIMULATION_UNAVAILABLE", "Expanded WebMCP evidence is not available for this context.");
  const sections: Record<string, unknown> = {};
  for (const section of input.sections as readonly ReviewEvidenceSection[]) {
    if (section === "causal_chain") sections[section] = { highestImpactBottleneck: packets.overview.highestImpactBottleneck };
    if (section === "topology_neighborhood") sections[section] = { components: Object.values(packets.component).map((packet) => ({ component: packet.component, neighbors: packet.neighbors })) };
    if (section === "requirement_evidence") sections[section] = { requirements: packets.requirement };
    if (section === "workload_hops") sections[section] = { workloads: packets.workload };
    if (section === "cost_contributors") sections[section] = { cost: packets.cost };
    if (section === "comparison_baseline") sections[section] = context.reviewDelta ? { delta: context.reviewDelta } : { note: "No prior revision was retained for this reference; use a delta-aware review for comparison." };
    if (section === "experiment_readiness") sections[section] = { revision: context.evidenceMeta?.architectureRevision, consentRequired: true, ran: false };
  }
  return capabilityOk({ reviewRef: input.reviewRef, sections, evidence: context.evidenceMeta ?? { architectureRevision: "unversioned", simulationRunId: "unversioned", simulatorVersion: "unknown", isStale: true, generatedAt: "unknown" }, caveats: ["Expanded sections are simulator-grounded evidence, not architecture instructions.", "Expansion does not run experiments or mutate the design."] });
}

export const expandDesignEvidenceCapability: AgentCapability<AgentContext, ExpandDesignEvidenceInput, CapabilityResult<ExpandDesignEvidenceOutput>> = {
  name: "expand_design_evidence",
  description: "Expand a prior review only when the player asks why, requests comparison, or the review reports truncation or ambiguity. Accepts one or two named sections; never accepts free-form queries.",
  inputSchema: expandDesignEvidenceInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute(context, input) { return expandDesignEvidence(context, input); },
};
