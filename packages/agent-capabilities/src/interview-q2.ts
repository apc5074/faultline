import type { AgentContext } from "./context.js";
import {
  createComponentExplanationPresentation,
  isMatchingVisualApplicationReceipt,
  type ComponentExplanationPresentation,
  type VisualApplicationReceipt,
} from "./component-explanation-presentation.js";
import {
  selectInterviewQuestion,
  assertInterviewQuestionCard,
  type ComposedInterviewQuestion,
  type InterviewQuestionCandidateCard,
  type SelectInterviewQuestionInput,
} from "./interview-question.js";
import { createPresentationCue, type PresentationCue } from "./presentation-cue.js";

export interface InterviewQ2Input {
  readonly context: AgentContext;
  readonly starterComponentIds: readonly string[];
  readonly componentCards: Readonly<Record<string, InterviewQ2ComponentCard>>;
  readonly sessionRevision?: number;
}

/** Structural browser-safe slice of a Level Profile component card. */
export interface InterviewQ2ComponentCard {
  readonly type: string;
  readonly placementIntent: string;
}

export interface InterviewQ2CandidateSet {
  readonly evidenceRevision: string;
  readonly candidates: readonly InterviewQuestionCandidateCard[];
}

export interface InterviewQ2Rubric {
  readonly requiredTopics: readonly string[];
  readonly evidenceBasis: "player_added_component_path";
  readonly acceptableTradeoffs: readonly string[];
  readonly forbiddenAssumptions: readonly string[];
}

export interface InterviewQ2Evidence {
  readonly evidenceRevision: string;
  readonly componentId: string;
  readonly componentType: string;
  readonly verifiedFacts: readonly string[];
}

export interface InterviewQ2Question {
  readonly question: ComposedInterviewQuestion;
  readonly evidence: InterviewQ2Evidence;
  readonly rubric: InterviewQ2Rubric;
  readonly presentation: ComponentExplanationPresentation;
  readonly presentationCue: PresentationCue;
}

export type InterviewQ2Release =
  | { readonly ok: true; readonly question: InterviewQ2Question; readonly receipt: VisualApplicationReceipt }
  | { readonly ok: false; readonly code: "PRESENTATION_REQUIRED" | "STALE_EVIDENCE"; readonly message: string };

function revisionFor(context: AgentContext): string {
  return context.evidenceMeta?.architectureRevision ?? "unversioned";
}

function currentPathComponentIds(context: AgentContext): Set<string> {
  const ids = new Set<string>();
  if (context.simulation?.available !== true) return ids;
  for (const channel of Object.values(context.simulation.workloadPaths ?? {})) {
    for (const path of channel.paths) for (const id of path.componentIds) ids.add(id);
  }
  return ids;
}

/** Build Q2 cards only for player-added components present in current simulator paths. */
export function buildPlayerAddedComponentCards(input: InterviewQ2Input): InterviewQ2CandidateSet {
  const evidenceRevision = revisionFor(input.context);
  const starterIds = new Set(input.starterComponentIds);
  const pathIds = currentPathComponentIds(input.context);
  const candidates = input.context.architecture.components
    .filter((component) => !starterIds.has(component.id) && pathIds.has(component.id))
    .map((component): InterviewQuestionCandidateCard | undefined => {
      const card = input.componentCards[component.type];
      if (!card) return undefined;
      return {
        cardId: `q2-component-${component.id}`,
        slotId: "component-justification-v2",
        kind: "component_justification",
        evidenceRevision,
        targetRefs: [{ kind: "component", id: component.id }],
        verifiedFacts: [
          `The component is present in the current architecture as ${component.type}.`,
          "Current workload evidence includes this component.",
          card.placementIntent,
        ],
        allowedProbeAngles: ["purpose and placement", "one tradeoff", "operational limitation"],
        difficulty: "early_career",
        prerequisiteConcepts: [card.placementIntent],
        forbiddenAssumptions: ["The component is automatically required.", "The component is a prescribed solution."],
        fallbackPrompt: `You added ${component.type}. Why is it here, where does it sit in the request path, and what tradeoff does it introduce?`,
        calibrationId: "component-justification",
        coachingObjectiveSummary: "Explain a player-added component using its observed role and a concrete tradeoff.",
      };
    })
    .filter((candidate): candidate is InterviewQuestionCandidateCard => candidate !== undefined)
    .filter((candidate) => {
      try {
        assertInterviewQuestionCard(candidate);
        return true;
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.cardId.localeCompare(b.cardId));
  return { evidenceRevision, candidates };
}

export function selectPlayerAddedComponentQuestion(
  input: InterviewQ2Input,
  selection: Omit<SelectInterviewQuestionInput, "slotId" | "evidenceRevision"> = {},
): InterviewQ2Question {
  const set = buildPlayerAddedComponentCards(input);
  const question = selectInterviewQuestion(set.candidates, {
    ...selection,
    slotId: "component-justification-v2",
    evidenceRevision: set.evidenceRevision,
  });
  const componentId = question.targetRefs.find((target) => target.kind === "component")?.id;
  if (!componentId) throw new Error("Q2 question must target a component.");
  const component = input.context.architecture.components.find((entry) => entry.id === componentId);
  if (!component) throw new Error("Q2 question target is not present in the current architecture.");
  const presentation = createComponentExplanationPresentation({
    commandId: `interview-q2-${question.cardId}`,
    componentId,
    evidenceRevision: question.evidenceRevision,
    sessionRevision: input.sessionRevision ?? 0,
  });
  const presentationCue = createPresentationCue(
    { kind: "spotlight", targets: [componentId], primaryTarget: componentId, reason: "finding", camera: "frame-primary" },
    question.evidenceRevision,
    { component: input.context.architecture.components.map((entry) => entry.id) },
  );
  if (!presentationCue) throw new Error("Q2 question target is not present in current architecture evidence.");
  const selectedCard = set.candidates.find((candidate) => candidate.cardId === question.cardId);
  return {
    question,
    evidence: {
      evidenceRevision: question.evidenceRevision,
      componentId,
      componentType: component.type,
      verifiedFacts: selectedCard?.verifiedFacts ?? question.targetRefs.map((target) => `Target ${target.kind}:${target.id}.`),
    },
    rubric: {
      requiredTopics: ["why this component exists", "role in the request path", "one concrete tradeoff"],
      evidenceBasis: "player_added_component_path",
      acceptableTradeoffs: selectedCard?.allowedProbeAngles.filter((angle) => /tradeoff|limitation|purpose/i.test(angle)) ?? ["one tradeoff"],
      forbiddenAssumptions: selectedCard?.forbiddenAssumptions ?? ["The component is a prescribed solution."],
    },
    presentation,
    presentationCue,
  };
}

/** Release Q2 facts only after the page acknowledges this exact focus render. */
export function releasePlayerAddedComponentQuestion(
  question: InterviewQ2Question,
  receipt: VisualApplicationReceipt | undefined,
): InterviewQ2Release {
  if (!receipt) return { ok: false, code: "PRESENTATION_REQUIRED", message: "Render the focused component before releasing the question or evidence." };
  if (!isMatchingVisualApplicationReceipt(question.presentation, receipt)) {
    return { ok: false, code: "STALE_EVIDENCE", message: "The component focus receipt is stale or targets a different render." };
  }
  return { ok: true, question, receipt };
}
