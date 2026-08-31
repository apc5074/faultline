import type { AgentCapability } from "../capability.js";
import type { AgentContext } from "../context.js";
import { createScopedEntityReference, resolveEntityTarget } from "../evidence-result.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";
import { inspectComponentInputSchema, type InspectComponentInput } from "../schemas.js";
import { buildOutput, selectComponentsBySelector, type InspectComponentSelectionOutput } from "./inspect-component-selectors.js";

export type { InspectComponentOutput, InspectComponentSelectionOutput } from "./inspect-component-selectors.js";
export { buildOutput } from "./inspect-component-selectors.js";

/**
 * Inspect one architecture component using trusted AgentContext evidence.
 * Does not invent metrics or duplicate simulator capacity formulas.
 */
export function inspectComponent(
  context: AgentContext,
  input: InspectComponentInput,
): CapabilityResult<import("./inspect-component-selectors.js").InspectComponentOutput | InspectComponentSelectionOutput> {
  if ("selector" in input) {
    const matches = selectComponentsBySelector(context.architecture.components, input.selector);
    if (matches.length === 0) {
      const available = context.challenge.allowedComponentTypes.includes(input.selector.type);
      return capabilityError(
        available ? "NOT_FOUND" : "INVALID_INPUT",
        available
          ? `No current component matches type "${input.selector.type}".`
          : `Component type "${input.selector.type}" is unavailable for this challenge.`,
      );
    }
    return capabilityOk<InspectComponentSelectionOutput>({
      selection: {
        type: input.selector.type,
        scope: input.selector.scope,
        matchedCount: matches.length,
        resolvedComponentIds: matches.map((component) => component.id),
      },
      components: matches.map((component) => buildOutput(component, context)),
    });
  }

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
  CapabilityResult<import("./inspect-component-selectors.js").InspectComponentOutput | InspectComponentSelectionOutput>
> = {
  name: "inspect_component",
  description:
    "Read the current invocation revision: inspect one component by exact componentId, or select a catalog type with { selector: { type, scope: \"all\" | \"topmost\" } }. For an unqualified type-wide/count/existence question, use scope all; use topmost only for positional requests. Do not reuse after a board edit.",
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
