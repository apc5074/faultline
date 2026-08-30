import type { AgentContext } from "./context.js";
import { hasCurrentExperimentConsent } from "./experiment-consent.js";
import { PHASE_8_EXPERIMENT_CAPABILITY_NAMES } from "./capability-names.js";
import type { AgentSessionState } from "./session.js";

export interface ExperimentReadiness {
  readonly availableNames: readonly string[];
  readonly evidenceRevision: string;
  readonly consent: {
    readonly state: "approved" | "required" | "expired" | "different_experiment";
    readonly capabilityName?: string;
    readonly expiresAt?: string;
  };
}

/** Structural readiness only; approval remains an exact page-session consent. */
export function experimentReadiness(context: AgentContext, session: AgentSessionState): ExperimentReadiness {
  const components = context.architecture.components;
  const hasSimulation = context.simulation?.available === true;
  const hasCache = components.some((component) => component.type === "cdn" || component.type === "redis");
  const services = components.filter((component) => component.type === "service");
  const regions = new Set(services.flatMap((component) => component.deployments.map((deployment) => deployment.regionId)));
  const availableNames = PHASE_8_EXPERIMENT_CAPABILITY_NAMES.filter((name) =>
    hasSimulation && (name === "run_load_test" || name === "change_traffic_pattern" ||
      (name === "flush_cache" && hasCache) ||
      (name === "inject_component_failure" && services.length > 0) ||
      (name === "inject_region_failure" && context.simulation?.regional?.active === true && regions.size >= 2) ||
      (name === "slow_consumers" && components.some((component) => component.type === "worker"))),
  );
  const consent = session.experimentConsent;
  const evidenceRevision = context.evidenceMeta?.architectureRevision ?? "unversioned";
  if (!consent) return { availableNames, evidenceRevision, consent: { state: "required" } };
  const expired = Date.parse(consent.expiresAt) <= Date.now();
  if (consent.architectureRevision !== evidenceRevision) return { availableNames, evidenceRevision, consent: { state: "required", capabilityName: consent.capabilityName } };
  if (expired) return { availableNames, evidenceRevision, consent: { state: "expired", capabilityName: consent.capabilityName, expiresAt: consent.expiresAt } };
  if (!hasCurrentExperimentConsent(consent, context, consent.capabilityName)) return { availableNames, evidenceRevision, consent: { state: "different_experiment", capabilityName: consent.capabilityName, expiresAt: consent.expiresAt } };
  return { availableNames, evidenceRevision, consent: { state: "approved", capabilityName: consent.capabilityName, expiresAt: consent.expiresAt } };
}
