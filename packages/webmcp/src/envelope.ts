import type {
  ActiveToolSuggestion,
  AgentContext,
  AgentEvidenceResult,
  CapabilityResult,
  KnownStateInput,
} from "@faultline/agent-capabilities";
import {
  buildAgentEvidenceResult,
  computeResultDigest,
  computeSurfaceRevision,
  provenanceFromContext,
  projectQuantitativeEvidence,
  separatePlayerAuthored,
  stripEnvelopeSourceFields,
  validateAgentEvidenceResult,
} from "@faultline/agent-capabilities";
import { capabilityError } from "@faultline/agent-capabilities";

import type { WebMcpEvidenceLease } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractSuggestions(data: Record<string, unknown>): readonly ActiveToolSuggestion[] | undefined {
  const suggestions = data.suggestedNextTools;
  if (!Array.isArray(suggestions)) return undefined;
  return suggestions.filter(
    (entry): entry is ActiveToolSuggestion =>
      isRecord(entry) && typeof entry.name === "string" && typeof entry.reason === "string",
  );
}

function extractTruncated(data: Record<string, unknown>): { readonly sections: readonly string[] } | undefined {
  if (data.truncated !== true) return undefined;
  const sections = Array.isArray(data.availableSections)
    ? data.availableSections.filter((section): section is string => typeof section === "string")
    : [];
  return sections.length > 0 ? { sections } : { sections: ["payload"] };
}

function projectCapabilityData(
  capabilityName: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const stripped = stripEnvelopeSourceFields(data);
  const separated = separatePlayerAuthored(capabilityName, stripped);
  return projectQuantitativeEvidence(separated) as Record<string, unknown>;
}

export interface WrapWebMcpEnvelopeOptions {
  readonly capabilityName: string;
  readonly mode: "read" | "visual" | "experiment";
  readonly lease: WebMcpEvidenceLease;
  readonly availableToolNames?: ReadonlySet<string>;
  readonly simulated?: boolean;
}

/** Wrap a successful capability payload in the WMP-2 evidence envelope. */
export function wrapWebMcpEnvelope(
  result: CapabilityResult<unknown>,
  context: AgentContext,
  options: WrapWebMcpEnvelopeOptions,
): CapabilityResult<AgentEvidenceResult<unknown>> {
  if (!result.ok) {
    return result as CapabilityResult<AgentEvidenceResult<unknown>>;
  }
  if (!isRecord(result.data)) {
    return capabilityError("INVALID_INPUT", `Capability "${options.capabilityName}" returned non-object data.`);
  }

  const next = extractSuggestions(result.data);
  const truncated = extractTruncated(result.data);
  const projected = projectCapabilityData(options.capabilityName, result.data);
  const surfaceRevision = options.availableToolNames
    ? computeSurfaceRevision([...options.availableToolNames])
    : options.lease.surfaceRevision;
  const state: KnownStateInput = {
    evidenceRevision: options.lease.evidenceRevision,
    sessionRevision: options.lease.sessionRevision,
    surfaceRevision,
    resultDigest: computeResultDigest(projected),
  };
  const provenance = provenanceFromContext(context, options.mode, options.simulated === true);
  const envelope = buildAgentEvidenceResult(projected, state, provenance, next, truncated);
  if (!validateAgentEvidenceResult(envelope)) {
    return capabilityError("INVALID_INPUT", `Capability "${options.capabilityName}" produced an invalid envelope.`);
  }
  return { ok: true, data: envelope };
}

/** True when the external agent receives the versioned envelope contract. */
export function isWebMcpEnvelopeEnabled(): boolean {
  return true;
}

export { validateAgentEvidenceResult };
