import type { ExperimentEvaluationResult } from "@faultline/simulator";
import type { AgentContext } from "./context.js";
import { createScopedEntityReference, reviewReference } from "./evidence-result.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "./result.js";

/** Add the shared evidence/persistence contract around deterministic simulator output. */
export function decorateExperimentResult(
  context: AgentContext,
  evaluation: ExperimentEvaluationResult,
): CapabilityResult<import("@faultline/core").ExperimentResult> {
  if (!evaluation.ok) {
    return capabilityError(
      evaluation.code === "UNSUPPORTED_TARGET" ? "NOT_FOUND" : evaluation.code === "INVALID_BASELINE" || evaluation.code === "UNAVAILABLE_EXPERIMENT" ? "SIMULATION_UNAVAILABLE" : "INVALID_INPUT",
      evaluation.message,
    );
  }
  const ids = new Map<string, "component" | "connection" | "region">();
  const add = (kind: "component" | "connection" | "region", entityId: string | undefined) => { if (entityId) ids.set(`${kind}:${entityId}`, kind); };
  const parameters = evaluation.data.parameters as unknown as Record<string, unknown>;
  add("component", typeof parameters.componentId === "string" ? parameters.componentId : undefined);
  add("region", typeof parameters.regionId === "string" ? parameters.regionId : undefined);
  for (const event of evaluation.data.events) { add("component", event.componentId); add("connection", event.connectionId); }
  const evidenceRevision = context.evidenceMeta?.architectureRevision ?? "unversioned";
  const affectedEntityRefs = [...ids.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, kind]) => {
    const entityId = key.slice(kind.length + 1);
    return { kind, entityId, ref: createScopedEntityReference(kind, entityId, evidenceRevision).ref };
  });
  return capabilityOk({
    ...evaluation.data,
    affectedEntityRefs,
    reviewRef: reviewReference(context, "experiment"),
    nonPersistent: true as const,
  });
}
