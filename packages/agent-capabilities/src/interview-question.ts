/** Bounded dynamic question contracts shared by interview hosts and adapters. */

export type InterviewV2SlotId =
  | "request-path-v2"
  | "component-justification-v2"
  | "live-scale-v2"
  | "challenge-edge-case-v2"
  | "live-failure-v2";

export type InterviewV2QuestionKind =
  | "request_path"
  | "component_justification"
  | "live_scale"
  | "challenge_edge_case"
  | "live_failure";

export type InterviewDifficulty = "intern" | "early_career" | "early_mid";
export type InterviewSelectionSource = "model" | "deterministic_fallback";

export interface InterviewQuestionTarget {
  readonly kind: "component" | "workload_channel" | "connection" | "none";
  readonly id: string;
}

export interface InterviewQuestionCandidateCard {
  readonly cardId: string;
  readonly slotId: InterviewV2SlotId;
  readonly kind: InterviewV2QuestionKind;
  readonly evidenceRevision: string;
  readonly targetRefs: readonly InterviewQuestionTarget[];
  readonly verifiedFacts: readonly string[];
  readonly allowedProbeAngles: readonly string[];
  readonly difficulty: InterviewDifficulty;
  readonly prerequisiteConcepts: readonly string[];
  readonly forbiddenAssumptions: readonly string[];
  readonly fallbackPrompt: string;
  readonly calibrationId?: string;
  readonly coachingObjectiveSummary?: string;
}

export interface SelectInterviewQuestionInput {
  readonly slotId: InterviewV2SlotId;
  readonly evidenceRevision: string;
  readonly candidateCardId?: string;
  readonly probeAngle?: string;
  readonly optionalWording?: string;
}

export interface ComposedInterviewQuestion {
  readonly cardId: string;
  readonly slotId: InterviewV2SlotId;
  readonly kind: InterviewV2QuestionKind;
  readonly evidenceRevision: string;
  readonly targetRefs: readonly InterviewQuestionTarget[];
  readonly prompt: string;
  readonly probeAngle: string;
  readonly selectionSource: InterviewSelectionSource;
  readonly calibrationId?: string;
  readonly coachingObjectiveSummary?: string;
}

export class InterviewQuestionContractError extends Error {
  override name = "InterviewQuestionContractError";
}

const idPattern = /^[a-z][a-z0-9-]*$/;
const slotKind: Readonly<Record<InterviewV2SlotId, InterviewV2QuestionKind>> = {
  "request-path-v2": "request_path",
  "component-justification-v2": "component_justification",
  "live-scale-v2": "live_scale",
  "challenge-edge-case-v2": "challenge_edge_case",
  "live-failure-v2": "live_failure",
};
const difficulties = new Set<InterviewDifficulty>(["intern", "early_career", "early_mid"]);
const targetKinds = new Set<InterviewQuestionTarget["kind"]>(["component", "workload_channel", "connection", "none"]);

function boundedText(value: unknown, context: string, max = 240): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new InterviewQuestionContractError(`${context} must be 1 to ${max} characters.`);
  }
}

function boundedArray(value: unknown, context: string, max: number): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw new InterviewQuestionContractError(`${context} must contain 1 to ${max} entries.`);
  }
  value.forEach((item, index) => boundedText(item, `${context}[${index}]`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate a card before it can be shown to or selected by an external host. */
export function assertInterviewQuestionCard(value: unknown): asserts value is InterviewQuestionCandidateCard {
  if (!isRecord(value)) throw new InterviewQuestionContractError("Interview question card must be an object.");
  boundedText(value.cardId, "cardId", 80);
  if (!idPattern.test(value.cardId)) throw new InterviewQuestionContractError("cardId must be a stable lowercase hyphenated identifier.");
  if (typeof value.slotId !== "string" || !(value.slotId in slotKind)) throw new InterviewQuestionContractError("card slotId is not supported.");
  if (value.kind !== slotKind[value.slotId as InterviewV2SlotId]) throw new InterviewQuestionContractError("card kind does not match slotId.");
  boundedText(value.evidenceRevision, "evidenceRevision", 160);
  if (!Array.isArray(value.targetRefs) || value.targetRefs.length > 4) throw new InterviewQuestionContractError("targetRefs must contain at most 4 entries.");
  for (const [index, target] of value.targetRefs.entries()) {
    if (!isRecord(target) || !targetKinds.has(target.kind as InterviewQuestionTarget["kind"])) throw new InterviewQuestionContractError(`targetRefs[${index}] is invalid.`);
    boundedText(target.id, `targetRefs[${index}].id`, 120);
    if (!idPattern.test(target.id)) throw new InterviewQuestionContractError(`targetRefs[${index}].id must be stable.`);
  }
  boundedArray(value.verifiedFacts, "verifiedFacts", 8);
  boundedArray(value.allowedProbeAngles, "allowedProbeAngles", 6);
  boundedArray(value.prerequisiteConcepts, "prerequisiteConcepts", 8);
  boundedArray(value.forbiddenAssumptions, "forbiddenAssumptions", 8);
  if (!difficulties.has(value.difficulty as InterviewDifficulty)) throw new InterviewQuestionContractError("card difficulty is invalid.");
  boundedText(value.fallbackPrompt, "fallbackPrompt", 240);
  if (value.calibrationId !== undefined) boundedText(value.calibrationId, "calibrationId", 120);
  if (value.coachingObjectiveSummary !== undefined) boundedText(value.coachingObjectiveSummary, "coachingObjectiveSummary", 240);
}

function validOptionalWording(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  boundedText(value, "optionalWording", 140);
  if (value.includes("\n") || (value.match(/[?]/g) ?? []).length > 1) {
    throw new InterviewQuestionContractError("optionalWording must be one short clause.");
  }
  if (/\b(must use|always use|exactly one|required component|canonical solution)\b/i.test(value)) {
    throw new InterviewQuestionContractError("optionalWording must not prescribe a solution.");
  }
  return value.trim().replace(/[?.!]+$/, "");
}

function stableCards(cards: readonly InterviewQuestionCandidateCard[], input: SelectInterviewQuestionInput): InterviewQuestionCandidateCard[] {
  const qualified = cards.filter((card) => {
    try {
      assertInterviewQuestionCard(card);
      return card.slotId === input.slotId && card.evidenceRevision === input.evidenceRevision;
    } catch {
      return false;
    }
  });
  return qualified.sort((a, b) => a.cardId.localeCompare(b.cardId));
}

/** Select one qualified card and compose a bounded question around its core. */
export function selectInterviewQuestion(
  cards: readonly InterviewQuestionCandidateCard[],
  input: SelectInterviewQuestionInput,
): ComposedInterviewQuestion {
  const qualified = stableCards(cards, input);
  const fallback = qualified[0];
  if (!fallback) throw new InterviewQuestionContractError("No qualified interview question card is available for the current slot.");
  const requested = input.candidateCardId ? qualified.find((card) => card.cardId === input.candidateCardId) : undefined;
  const card = requested ?? fallback;
  const source: InterviewSelectionSource = requested ? "model" : "deterministic_fallback";
  const wording = validOptionalWording(input.optionalWording);
  const angle = input.probeAngle && card.allowedProbeAngles.includes(input.probeAngle)
    ? input.probeAngle
    : card.allowedProbeAngles[0]!;
  const prompt = wording ? `${card.fallbackPrompt} ${wording}.` : card.fallbackPrompt;
  return {
    cardId: card.cardId,
    slotId: card.slotId,
    kind: card.kind,
    evidenceRevision: card.evidenceRevision,
    targetRefs: card.targetRefs,
    prompt,
    probeAngle: angle,
    selectionSource: source,
    ...(card.calibrationId !== undefined ? { calibrationId: card.calibrationId } : {}),
    ...(card.coachingObjectiveSummary !== undefined ? { coachingObjectiveSummary: card.coachingObjectiveSummary } : {}),
  };
}
