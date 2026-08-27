import type { AgentCapability } from "../capability.js";
import type { AgentContext, AgentComponentEvidence } from "../context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { noInputSchema } from "../schemas.js";

export type BottleneckRiskKind = "saturation" | "headroom" | "latency" | "unmet_demand" | "hot_key" | "budget";
export interface BottleneckRisk {
  readonly kind: BottleneckRiskKind;
  readonly componentId?: string;
  readonly value?: number;
  readonly evidence: string;
}
export interface InspectBottlenecksOutput {
  readonly risks: readonly BottleneckRisk[];
}

const kindOrder: readonly BottleneckRiskKind[] = ["saturation", "headroom", "latency", "unmet_demand", "hot_key", "budget"];

function utilization(evidence: AgentComponentEvidence): number | undefined {
  return evidence.metrics.utilization ?? evidence.metrics.effectiveUtilization;
}

export function inspectBottlenecks(context: AgentContext): CapabilityResult<InspectBottlenecksOutput> {
  const simulation = context.simulation;
  if (!simulation || simulation.available !== true) {
    return capabilityError("SIMULATION_UNAVAILABLE", simulation?.validationErrors?.join(" ") ?? "Simulation evidence is not available.");
  }
  const risks: BottleneckRisk[] = [];
  for (const componentId of Object.keys(simulation.components).sort((a, b) => a.localeCompare(b))) {
    const evidence = simulation.components[componentId]!;
    const value = utilization(evidence);
    if (evidence.state === "critical" || evidence.state === "saturated" || (value !== undefined && value >= 1)) {
      risks.push({ kind: "saturation", componentId, ...(value !== undefined ? { value } : {}), evidence: evidence.state ?? "utilization at or above capacity" });
    }
  }
  const headrooms = Object.entries(simulation.components)
    .flatMap(([componentId, evidence]) => (evidence.capacity ?? []).map((entry) => ({ componentId, value: entry.headroom })))
    .sort((a, b) => a.value - b.value || a.componentId.localeCompare(b.componentId));
  const lowest = headrooms[0];
  if (lowest && lowest.value < 0.2) risks.push({ kind: "headroom", componentId: lowest.componentId, value: lowest.value, evidence: "lowest simulator-reported capacity headroom" });
  const latencyRequirement = context.challenge.requirements.find((requirement) => requirement.type === "latency");
  const p95 = simulation.system?.redirectP95Ms;
  if (p95 !== undefined && latencyRequirement && p95 >= latencyRequirement.target) risks.push({ kind: "latency", value: p95, evidence: "simulator-reported p95 latency is at or above the challenge target" });
  if (simulation.system?.throughputPass === false) risks.push({ kind: "unmet_demand", evidence: "simulator-reported throughput requirement is not passing" });
  if (simulation.scenarios?.hotKey?.active && simulation.scenarios.hotKey.passed === false) risks.push({ kind: "hot_key", evidence: "simulator-reported hot-key scenario is not passing" });
  if (context.cost && context.cost.monthlyTotal > context.challenge.monthlyBudget) risks.push({ kind: "budget", value: context.cost.monthlyTotal, evidence: "simulator-reported monthly cost exceeds the challenge budget" });
  return capabilityOk({ risks: risks.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || (a.componentId ?? "").localeCompare(b.componentId ?? "")) });
}

export const inspectBottlenecksCapability: AgentCapability<AgentContext, undefined, CapabilityResult<InspectBottlenecksOutput>> = {
  name: "inspect_bottlenecks",
  description: "Summarize and rank material simulator-evidenced risks in the current architecture. Reports facts only and does not prescribe a topology or decide correctness independently.",
  inputSchema: noInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute(context) { return inspectBottlenecks(context); },
};
