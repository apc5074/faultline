import type { Architecture, InterviewScenarioCalibration, InterviewScenarioCandidate } from "@faultline/core";

export interface InterviewScaleQuestion {
  readonly slotId: "live-scale-v2";
  readonly questionId: string;
  readonly candidateId: string;
  readonly evidenceRevision: string;
  readonly targetComponentId: string;
  readonly targetConfigPath: string;
  readonly prompt: string;
  readonly coachingObjective: string;
  readonly earlyCareerEditCap: number;
  readonly trafficMultiplier?: number;
}

export interface InterviewScaleReview {
  readonly questionId: string;
  readonly candidateId: string;
  readonly evidenceRevision: string;
  readonly candidateArchitectureRevision: string;
  readonly simulatorRunId: string;
  readonly targetComponentId: string;
  readonly targetCapacityDelta: number;
  readonly passed: boolean;
  readonly reviewDigest: string;
  readonly simulated: true;
  readonly official: false;
}

export type InterviewScaleEditValidation =
  | { readonly ok: true; readonly changedPath: string }
  | { readonly ok: false; readonly code: "NO_CHANGE" | "WRONG_TARGET" | "UNSUPPORTED_EDIT"; readonly message: string };

function candidateFor(calibration: InterviewScenarioCalibration, candidateId?: string): InterviewScenarioCandidate | undefined {
  return [...calibration.candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId)).find((candidate) => candidate.kind === "scale" && (!candidateId || candidate.candidateId === candidateId));
}

/** Compose a modest Q3 prompt without exposing the calibrated witness value. */
export function buildInterviewScaleQuestion(calibration: InterviewScenarioCalibration, evidenceRevision: string, candidateId?: string): InterviewScaleQuestion {
  const candidate = candidateFor(calibration, candidateId);
  if (!candidate || !candidate.targetConfigPath) throw new Error("No qualified scale scenario is available.");
  return {
    slotId: "live-scale-v2", questionId: `q3-${candidate.candidateId}`, candidateId: candidate.candidateId,
    evidenceRevision, targetComponentId: candidate.targetComponentId, targetConfigPath: candidate.targetConfigPath,
    prompt: "Traffic has increased modestly and the highlighted component is saturated. Make one small capacity edit, then explain why it addresses the observed bottleneck and what tradeoff it introduces.",
    coachingObjective: candidate.coachingObjective, earlyCareerEditCap: candidate.earlyCareerEditCap,
    ...(candidate.trafficMultiplier !== undefined ? { trafficMultiplier: candidate.trafficMultiplier } : {}),
  };
}

function valueAt(architecture: Architecture, componentId: string, path: string): unknown {
  return architecture.components.find((component) => component.id === componentId)?.config[path];
}

/** Require the candidate target and its registry-owned capacity dial to change. */
export function validateInterviewScaleEdit(before: Architecture, after: Architecture, question: InterviewScaleQuestion): InterviewScaleEditValidation {
  const beforeValue = valueAt(before, question.targetComponentId, question.targetConfigPath);
  const afterValue = valueAt(after, question.targetComponentId, question.targetConfigPath);
  if (beforeValue === undefined || afterValue === undefined) return { ok: false, code: "UNSUPPORTED_EDIT", message: "The calibrated capacity control is unavailable in the current architecture." };
  if (beforeValue === afterValue) return { ok: false, code: "NO_CHANGE", message: "Change the highlighted component's calibrated capacity control before reviewing the scenario." };
  const changedTargets = after.components.filter((component, index) => JSON.stringify(component) !== JSON.stringify(before.components[index])).map((component) => component.id);
  if (!changedTargets.includes(question.targetComponentId)) return { ok: false, code: "WRONG_TARGET", message: "This scenario requires a capacity change on the highlighted component." };
  return { ok: true, changedPath: `${question.targetComponentId}.${question.targetConfigPath}` };
}

function digest(value: string): string {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

/** Create a revision-bound simulator review packet; no budget or requirement gates are consulted here. */
export function createInterviewScaleReview(input: Omit<InterviewScaleReview, "reviewDigest" | "simulated" | "official">): InterviewScaleReview {
  return { ...input, reviewDigest: digest(JSON.stringify(input)), simulated: true, official: false };
}

export function validateInterviewScaleReview(review: InterviewScaleReview, question: InterviewScaleQuestion, currentArchitectureRevision: string): { readonly ok: true } | { readonly ok: false; readonly code: "STALE_DIGEST" | "INVALID_REVIEW"; readonly message: string } {
  if (review.questionId !== question.questionId || review.candidateId !== question.candidateId || review.evidenceRevision !== question.evidenceRevision || review.candidateArchitectureRevision !== currentArchitectureRevision) return { ok: false, code: "STALE_DIGEST", message: "The scenario review is stale; prepare a fresh review for the current architecture." };
  const { reviewDigest: _reviewDigest, simulated: _simulated, official: _official, ...unsigned } = review;
  if (review.reviewDigest !== createInterviewScaleReview(unsigned).reviewDigest) return { ok: false, code: "INVALID_REVIEW", message: "The simulator review digest is invalid." };
  if (!Number.isFinite(review.targetCapacityDelta) || review.targetCapacityDelta <= 0) return { ok: false, code: "INVALID_REVIEW", message: "The review lacks a positive target capacity delta." };
  return { ok: true };
}
