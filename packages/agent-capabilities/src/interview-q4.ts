import { selectInterviewQuestion, type ComposedInterviewQuestion, type InterviewQuestionCandidateCard } from "./interview-question.js";

export interface InterviewQ4EdgeCaseCard {
  readonly id: string;
  readonly setting: string;
  readonly promptCore: string;
  readonly expectedTopics: readonly string[];
  readonly acceptableTradeoffs: readonly string[];
  readonly commonMisconceptions: readonly string[];
  readonly allowedProbeAngles: readonly string[];
  readonly difficulty: "intern" | "early_career" | "early_mid";
}

export interface InterviewQ4Curriculum {
  readonly edgeCaseCards: readonly InterviewQ4EdgeCaseCard[];
  readonly settingFacts: readonly string[];
}

export interface InterviewQ4Input {
  readonly curriculum: InterviewQ4Curriculum;
  readonly evidenceRevision: string;
  readonly candidateCardId?: string;
  readonly probeAngle?: string;
}

export interface InterviewQ4Rubric {
  readonly requiredTopics: readonly string[];
  readonly acceptableTradeoffs: readonly string[];
  readonly commonMisconceptions: readonly string[];
  readonly evidenceBasis: "authored_edge_case_and_general_reasoning";
}

export interface InterviewQ4Evidence {
  readonly evidenceRevision: string;
  readonly setting: string;
  readonly verifiedFacts: readonly string[];
  readonly simulatorUsed: false;
}

export interface InterviewQ4Question {
  readonly question: ComposedInterviewQuestion;
  readonly questionId: string;
  readonly setting: string;
  readonly evidence: InterviewQ4Evidence;
  readonly rubric: InterviewQ4Rubric;
  readonly expectedTopics: readonly string[];
  readonly acceptableTradeoffs: readonly string[];
  readonly commonMisconceptions: readonly string[];
  readonly rubricBasis: "authored_edge_case_and_general_reasoning";
  readonly simulatorUsed: false;
}

function toCandidate(card: InterviewQ4EdgeCaseCard, evidenceRevision: string, settingFacts: readonly string[]): InterviewQuestionCandidateCard {
  return {
    cardId: `q4-${card.id}`, slotId: "challenge-edge-case-v2", kind: "challenge_edge_case", evidenceRevision,
    targetRefs: [{ kind: "none", id: "none" }], verifiedFacts: [...settingFacts.slice(0, 4), card.setting],
    allowedProbeAngles: card.allowedProbeAngles, difficulty: card.difficulty,
    prerequisiteConcepts: card.expectedTopics.slice(0, 8), forbiddenAssumptions: card.commonMisconceptions,
    fallbackPrompt: `${card.promptCore} Use the current architecture as context, distinguish observed facts from general reasoning, and name one tradeoff.`,
    calibrationId: card.id, coachingObjectiveSummary: "Reason through an authored edge case without prescribing a topology.",
  };
}

/** Select an authored, current Q4 card without invoking simulator scenario evaluation. */
export function selectInterviewEdgeCase(input: InterviewQ4Input): InterviewQ4Question {
  if (!input.evidenceRevision.trim()) throw new Error("Q4 requires a current evidence revision.");
  const cards = input.curriculum.edgeCaseCards.map((card) => toCandidate(card, input.evidenceRevision, input.curriculum.settingFacts));
  const question = selectInterviewQuestion(cards, { slotId: "challenge-edge-case-v2", evidenceRevision: input.evidenceRevision, ...(input.candidateCardId ? { candidateCardId: input.candidateCardId } : {}), ...(input.probeAngle ? { probeAngle: input.probeAngle } : {}) });
  const selected = input.curriculum.edgeCaseCards.find((card) => `q4-${card.id}` === question.cardId);
  if (!selected) throw new Error("Selected Q4 card is no longer applicable.");
  return {
    question,
    questionId: question.cardId,
    setting: selected.setting,
    evidence: {
      evidenceRevision: input.evidenceRevision,
      setting: selected.setting,
      verifiedFacts: [...input.curriculum.settingFacts.slice(0, 4), selected.setting],
      simulatorUsed: false,
    },
    rubric: {
      requiredTopics: selected.expectedTopics,
      acceptableTradeoffs: selected.acceptableTradeoffs,
      commonMisconceptions: selected.commonMisconceptions,
      evidenceBasis: "authored_edge_case_and_general_reasoning",
    },
    expectedTopics: selected.expectedTopics,
    acceptableTradeoffs: selected.acceptableTradeoffs,
    commonMisconceptions: selected.commonMisconceptions,
    rubricBasis: "authored_edge_case_and_general_reasoning",
    simulatorUsed: false,
  };
}

export interface InterviewQ4Evaluation {
  readonly questionId: string;
  readonly evidenceRevision: string;
  readonly answer: string;
  readonly verdict: "correct" | "partial" | "incorrect";
  readonly coveredTopics: readonly string[];
  readonly namedTradeoffs: readonly string[];
  readonly simulatorUsed: false;
}

export function validateInterviewQ4Answer(input: InterviewQ4Evaluation, question: InterviewQ4Question): { readonly ok: true } | { readonly ok: false; readonly code: "STALE_QUESTION" | "INVALID_ANSWER"; readonly message: string } {
  if (input.questionId !== question.questionId || input.evidenceRevision !== question.question.evidenceRevision) return { ok: false, code: "STALE_QUESTION", message: "The edge-case question is stale; refresh the current Q4 question." };
  if (!input.answer.trim() || input.answer.length > 20_000 || input.simulatorUsed !== false) return { ok: false, code: "INVALID_ANSWER", message: "Q4 requires a bounded answer evaluated as general reasoning, not simulator scenario evidence." };
  return { ok: true };
}
