import type { Architecture, InterviewScenarioCalibration, InterviewScenarioCandidate } from "@faultline/core";

export interface InterviewFailureQuestion {
  readonly slotId: "live-failure-v2";
  readonly questionId: string;
  readonly candidateId: string;
  readonly evidenceRevision: string;
  readonly targetComponentId: string;
  readonly targetComponentType: string;
  readonly failureScope: "component" | "region";
  readonly prompt: string;
  readonly coachingObjective: string;
  readonly earlyCareerEditCap: number;
  readonly allowedRecoveryEditClasses: readonly string[];
  readonly rubric: {
    readonly requiredTopics: readonly string[];
    readonly evidenceBasis: "modeled_component_failure";
    readonly acceptableTradeoffs: readonly string[];
  };
  readonly evidenceSummary: readonly string[];
}

export interface InterviewFailureReview {
  readonly questionId: string;
  readonly candidateId: string;
  readonly evidenceRevision: string;
  readonly candidateArchitectureRevision: string;
  readonly simulatorRunId: string;
  readonly targetComponentId: string;
  readonly observedFailure: string;
  readonly recoveryEditClasses: readonly string[];
  readonly recoveryEditCount: number;
  readonly passed: boolean;
  readonly reviewDigest: string;
  readonly simulated: true;
  readonly official: false;
}

export interface InterviewCompletionSummary {
  readonly strengths: readonly [string, string];
  readonly nextPracticeArea: string;
  readonly official: false;
}

function failureCandidate(calibration: InterviewScenarioCalibration, candidateId?: string): InterviewScenarioCandidate | undefined {
  return [...calibration.candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId)).find((candidate) => candidate.kind === "failure" && (!candidateId || candidate.candidateId === candidateId) && candidate.failureScope !== undefined);
}

function componentType(architecture: Architecture | undefined, componentId: string): string {
  return architecture?.components.find((component) => component.id === componentId)?.type ?? "component";
}

/** Build a chat-graded failure question that names the modeled outage target without requiring canvas edits. */
export function buildInterviewFailureQuestion(
  calibration: InterviewScenarioCalibration,
  evidenceRevision: string,
  candidateId?: string,
  architecture?: Architecture,
): InterviewFailureQuestion {
  const candidate = failureCandidate(calibration, candidateId);
  if (!candidate || !candidate.failureScope) throw new Error("No qualified failure scenario is available.");
  const targetComponentType = componentType(architecture, candidate.targetComponentId);
  const recoveryHints = candidate.recoveryEditClasses.slice(0, 2).join(" or ");
  const reason = candidate.primaryReason.trim().slice(0, 80);
  const longPrompt = `Modeled ${candidate.failureScope} outage on highlighted ${targetComponentType} (${candidate.targetComponentId}): ${reason}. In chat only, explain user impact, a recovery of at most two simple changes, and one remaining limitation.`;
  const prompt = longPrompt.length > 240
    ? `Outage on highlighted ${targetComponentType} (${candidate.targetComponentId}): ${reason.slice(0, 48)}. Explain impact, two-change chat recovery, remaining limit.`
    : longPrompt;
  return {
    slotId: "live-failure-v2",
    questionId: `q5-${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    evidenceRevision,
    targetComponentId: candidate.targetComponentId,
    targetComponentType,
    failureScope: candidate.failureScope,
    prompt,
    coachingObjective: candidate.coachingObjective,
    earlyCareerEditCap: Math.min(2, candidate.earlyCareerEditCap),
    allowedRecoveryEditClasses: candidate.recoveryEditClasses,
    rubric: {
      requiredTopics: ["failure impact on the request path", "recovery approach", "remaining limitation"],
      evidenceBasis: "modeled_component_failure",
      acceptableTradeoffs: recoveryHints ? [`Recovery may use ${recoveryHints}`] : ["Name one recovery tradeoff"],
    },
    evidenceSummary: [
      `Modeled ${candidate.failureScope} failure target: ${candidate.targetComponentId} (${targetComponentType}).`,
      reason,
      "Answer in chat only; do not edit the architecture for this question.",
      recoveryHints ? `Supported recovery classes: ${recoveryHints}.` : "Keep recovery to at most two simple changes.",
    ],
  };
}

function digest(value: string): string {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

export function createInterviewFailureReview(input: Omit<InterviewFailureReview, "reviewDigest" | "simulated" | "official">): InterviewFailureReview {
  if (input.recoveryEditCount < 0 || input.recoveryEditCount > 2 || input.recoveryEditClasses.length > 2) throw new Error("Failure recovery is limited to two edits.");
  return { ...input, reviewDigest: digest(JSON.stringify(input)), simulated: true, official: false };
}

export function validateInterviewFailureReview(review: InterviewFailureReview, question: InterviewFailureQuestion, currentArchitectureRevision: string): { readonly ok: true } | { readonly ok: false; readonly code: "STALE_DIGEST" | "INVALID_REVIEW"; readonly message: string } {
  if (review.questionId !== question.questionId || review.candidateId !== question.candidateId || review.evidenceRevision !== question.evidenceRevision || review.candidateArchitectureRevision !== currentArchitectureRevision) return { ok: false, code: "STALE_DIGEST", message: "The failure review is stale; prepare a fresh review for the current architecture." };
  if (!review.observedFailure.trim() || review.recoveryEditCount < 0 || review.recoveryEditCount > question.earlyCareerEditCap || review.recoveryEditClasses.some((editClass) => !question.allowedRecoveryEditClasses.includes(editClass))) return { ok: false, code: "INVALID_REVIEW", message: "The failure review does not contain a bounded, supported recovery." };
  const { reviewDigest: _digest, simulated: _simulated, official: _official, ...unsigned } = review;
  if (review.reviewDigest !== createInterviewFailureReview(unsigned).reviewDigest) return { ok: false, code: "INVALID_REVIEW", message: "The failure review digest is invalid." };
  return { ok: true };
}

/** A failed review never advances Q5; only a current passing review can be completed after critique. */
export function failureReviewCanAdvance(review: InterviewFailureReview, question: InterviewFailureQuestion, currentArchitectureRevision: string): boolean {
  return review.passed === true && validateInterviewFailureReview(review, question, currentArchitectureRevision).ok;
}

export function createInterviewCompletionSummary(strengths: readonly string[], nextPracticeArea: string): InterviewCompletionSummary {
  if (strengths.length !== 2 || strengths.some((strength) => !strength.trim() || strength.length > 240) || !nextPracticeArea.trim() || nextPracticeArea.length > 240) throw new Error("Completion requires exactly two bounded strengths and one next practice area.");
  return { strengths: [strengths[0]!, strengths[1]!] as [string, string], nextPracticeArea, official: false };
}
