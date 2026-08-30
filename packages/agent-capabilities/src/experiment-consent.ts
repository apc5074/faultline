import { architectureEvidenceFingerprint } from "./architecture-predicates.js";
import type { AgentContext } from "./context.js";
import type { Phase8ExperimentCapabilityName } from "./capability-names.js";
import type { ExperimentConsent } from "./session.js";

export const EXPERIMENT_CONSENT_TTL_MS = 5 * 60_000;

export function grantExperimentConsent(
  context: AgentContext,
  capabilityName: Phase8ExperimentCapabilityName,
  now = new Date(),
): ExperimentConsent {
  return {
    capabilityName,
    architectureRevision: architectureEvidenceFingerprint(context.architecture),
    grantedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + EXPERIMENT_CONSENT_TTL_MS).toISOString(),
  };
}

/** Consent is exact, expires, and is invalidated by canonical architecture edits. */
export function hasCurrentExperimentConsent(
  consent: ExperimentConsent | null | undefined,
  context: AgentContext,
  capabilityName: string,
  now = new Date(),
): boolean {
  if (!consent || consent.capabilityName !== capabilityName) return false;
  if (Date.parse(consent.expiresAt) <= now.getTime()) return false;
  return consent.architectureRevision === architectureEvidenceFingerprint(context.architecture);
}
