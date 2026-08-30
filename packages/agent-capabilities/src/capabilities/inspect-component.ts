import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { createScopedEntityReference, resolveEntityTarget } from "../evidence-result.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { inspectComponentInputSchema, type InspectComponentInput } from "../schemas.js";
import { buildOutput } from "./inspect-component-selectors.js";

export type { InspectComponentOutput } from "./inspect-component-selectors.js";
export { buildOutput } from "./inspect-component-selectors.js";

/**
 * Inspect one architecture component using trusted AgentContext evidence.
 * Does not invent metrics or duplicate simulator capacity formulas.
 */
export function inspectComponent(
  context: AgentContext,
  input: InspectComponentInput,
): CapabilityResult<import("./inspect-component-selectors.js").InspectComponentOutput> {
  const revision = context.evidenceMeta?.architectureRevision ?? "unversioned";
  const resolved = resolveEntityTarget(input.componentId, revision, {
    component: context.architecture.components.map((component) => component.id),
    connection: context.architecture.connections.map((connection) => connection.id),
    requirement: (context.requirementResults ?? []).map((result) => result.id),
    region: [],
    workload: Object.keys(context.simulation?.available === true ? context.simulation.workloadPaths ?? {} : {}),
    scenario: [],
    experiment: [],
  });
  const componentId = resolved?.kind === "component" ? resolved.entityId : input.componentId.startsWith("wmp-ent-") ? undefined : input.componentId;
  const component = componentId ? context.architecture.components.find((candidate) => candidate.id === componentId) : undefined;
  if (!component) {
    if (input.componentId.startsWith("wmp-ent-")) {
      return capabilityError("NOT_FOUND", "Scoped entity reference is stale or does not match the current evidence revision.", {
        retryable: true,
        currentEvidenceRevision: revision,
        recoveryTool: "review_current_design",
      });
    }
    return capabilityError("NOT_FOUND", `Unknown component "${input.componentId}".`);
  }
  return capabilityOk(buildOutput(component, context));
}

/** Create a revision-scoped reference for a component entity. */
export function componentEntityReference(context: AgentContext, componentId: string) {
  return createScopedEntityReference("component", componentId, context.evidenceMeta?.architectureRevision ?? "unversioned");
}

export const inspectComponentCapability: AgentCapability<
  AgentContext,
  InspectComponentInput,
  CapabilityResult<import("./inspect-component-selectors.js").InspectComponentOutput>
> = {
  name: "inspect_component",
  description:
    "Inspect one infrastructure component: config, simulator metrics, workload-fit evidence when present, and monthly cost when available. Returns NOT_FOUND for unknown IDs.",
  inputSchema: inspectComponentInputSchema,
  mode: "read",
  availableWhen: () => true,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute(context, input) {
    return inspectComponent(context, input);
  },
};
