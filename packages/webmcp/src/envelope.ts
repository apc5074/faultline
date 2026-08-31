import type {
  ActiveToolSuggestion,
  AgentContext,
  AgentEvidenceResult,
  CapabilityResult,
  KnownStateInput,
  NextToolSuggestion,
} from "@faultline/agent-capabilities";
import {
  buildAgentEvidenceResult,
  computeRequestFingerprint,
  computeResultDigest,
  computeSurfaceRevision,
  provenanceFromContext,
  projectQuantitativeEvidence,
  presentationCueForCapability,
  presentationCueForSubjects,
  subjectsForCapability,
  separatePlayerAuthored,
  stripEnvelopeSourceFields,
  selectEvidenceContinuations,
  validatePresentationCue,
  validateAgentEvidenceResult,
  reviewRequestIdentity,
} from "@faultline/agent-capabilities";
import { capabilityError } from "@faultline/agent-capabilities";

import type { WebMcpEvidenceLease } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractSuggestions(data: Record<string, unknown>): readonly unknown[] | undefined {
  const suggestions = data.suggestedNextTools;
  if (!Array.isArray(suggestions)) return undefined;
  return suggestions;
}

function extractTruncated(data: Record<string, unknown>): { readonly sections: readonly string[] } | undefined {
  if (data.truncated !== true) return undefined;
  const sections = Array.isArray(data.availableSections)
    ? data.availableSections.filter((section): section is string => typeof section === "string")
    : [];
  return sections.length > 0 ? { sections } : { sections: ["payload"] };
}

function extractPresentationCue(data: Record<string, unknown>, evidenceRevision: string) {
  if (!Object.prototype.hasOwnProperty.call(data, "presentationCue")) return undefined;
  const cue = data.presentationCue;
  return validatePresentationCue(cue, evidenceRevision) ? cue : null;
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
  /** Validated by the capability registry before a successful result is returned. */
  readonly input?: unknown;
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

  const surfaceRevision = options.availableToolNames
    ? computeSurfaceRevision([...options.availableToolNames])
    : options.lease.surfaceRevision;
  const rawSuggestions = extractSuggestions(result.data) ?? [];
  const legacySuggestions = rawSuggestions.filter(
    (entry): entry is ActiveToolSuggestion => isRecord(entry) && typeof entry.name === "string" && typeof entry.reason === "string",
  );
  const typedSuggestions = selectEvidenceContinuations({
    candidates: rawSuggestions,
    context,
    evidenceRevision: options.lease.evidenceRevision,
    surfaceRevision,
    availableCapabilityNames: options.availableToolNames ?? new Set(),
  });
  const next: readonly NextToolSuggestion[] = [...legacySuggestions, ...typedSuggestions].slice(0, 3);
  const truncated = extractTruncated(result.data);
  const explicitPresentation = extractPresentationCue(result.data, options.lease.evidenceRevision);
  const subjects = subjectsForCapability(options.capabilityName, result.data, context, options.input);
  const presentation = explicitPresentation === null
    ? undefined
    : explicitPresentation ?? (subjects ? presentationCueForSubjects(subjects) : presentationCueForCapability(options.capabilityName, result.data, context, options.input));
  const projected = projectCapabilityData(options.capabilityName, result.data);
  delete projected.presentationCue;
  const reviewIdentity = options.capabilityName === "review_current_design"
    ? reviewRequestIdentity(
      (isRecord(options.input) ? options.input : {}) as Parameters<typeof reviewRequestIdentity>[0],
      options.lease.snapshot.session,
    )
    : undefined;
  const digestProjection = options.capabilityName === "review_current_design"
    ? (() => { const { focus: _focus, ...focusIndependent } = projected; return focusIndependent; })()
    : projected;
  const resultDigest = computeResultDigest(digestProjection);
  const state: KnownStateInput = {
    evidenceRevision: options.lease.evidenceRevision,
    sessionRevision: options.lease.sessionRevision,
    surfaceRevision,
    resultDigest,
    requestFingerprint: computeRequestFingerprint({
      capabilityName: options.capabilityName,
      ...(reviewIdentity ?? {
        ...(isRecord(options.input) && typeof options.input.intent === "string" ? { intent: options.input.intent } : {}),
        ...(isRecord(options.input) && typeof options.input.targetId === "string" ? { target: { kind: "target", id: options.input.targetId } } : {}),
      }),
      evidenceRevision: options.lease.evidenceRevision,
      sessionRevision: options.lease.sessionRevision,
      focus: options.lease.snapshot.session.focus,
      surfaceRevision,
      resultDigest,
    }),
  };
  const provenance = provenanceFromContext(context, options.mode, options.simulated === true);
  const envelope = buildAgentEvidenceResult(projected, state, provenance, next, truncated, presentation, resultDigest, subjects);
  if (!validateAgentEvidenceResult(envelope)) {
    return capabilityError("INVALID_INPUT", `Capability "${options.capabilityName}" produced an invalid envelope.`);
  }
  return { ok: true, data: envelope };
}

export { validateAgentEvidenceResult };
