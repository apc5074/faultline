import type { AgentContext } from "./context.js";
import type { InterviewV2SlotId } from "./interview-question.js";
import type { RequestPathQuestion } from "./interview-q1.js";
import { buildRequestPathQuestion } from "./interview-q1.js";
import type { InterviewQ2Question } from "./interview-q2.js";
import type { InterviewQ4Question } from "./interview-q4.js";
import type { InterviewFailureQuestion } from "./interview-q5.js";
import type { InterviewQuestion } from "./interview-state.js";

/** Discussion slots that return agent-facing assessment packets with the current question. */
export type InterviewChatAssessmentSlot = Extract<
  InterviewV2SlotId,
  "request-path-v2" | "component-justification-v2" | "challenge-edge-case-v2" | "live-failure-v2"
>;

/**
 * Bounded rubric/evidence the agent must use when evaluating a chat-slot answer.
 * Hosts attach this to the returned current question; agents must not invent rubric topics.
 */
export interface InterviewChatAssessment {
  readonly slotId: InterviewChatAssessmentSlot;
  readonly requiredTopics: readonly string[];
  readonly evidenceSummary: readonly string[];
  readonly evidenceBasis: string;
  readonly assessGuidance: string;
  readonly acceptableTradeoffs?: readonly string[];
  readonly commonMisconceptions?: readonly string[];
  readonly forbiddenAssumptions?: readonly string[];
}

function bounded(items: readonly string[], max = 8): readonly string[] {
  return items.filter((item) => item.trim().length > 0).slice(0, max);
}

/** Project Q1 evidence + rubric into the agent-facing assessment packet. */
export function assessmentFromRequestPathQuestion(question: RequestPathQuestion): InterviewChatAssessment {
  const evidenceSummary = question.evidence.available
    ? bounded([
        `Path status: ${question.evidence.status ?? "unknown"}.`,
        question.evidence.channelId ? `Workload channel: ${question.evidence.channelId}.` : "",
        question.evidence.pathId ? `Path id: ${question.evidence.pathId}.` : "",
        question.evidence.componentIds.length > 0 ? `Components: ${question.evidence.componentIds.join(" → ")}.` : "",
        question.evidence.failureReason ? `Failure: ${question.evidence.failureReason}.` : "",
        question.evidence.unavailableReason ? `Unavailable: ${question.evidence.unavailableReason}.` : "",
      ])
    : bounded([
        "Current workload-path evidence is unavailable.",
        question.evidence.unavailableReason ? `Reason: ${question.evidence.unavailableReason}.` : "",
      ]);
  return {
    slotId: "request-path-v2",
    requiredTopics: question.rubric.requiredTopics,
    evidenceSummary,
    evidenceBasis: question.rubric.evidenceBasis,
    assessGuidance: "Evaluate only against requiredTopics and the supplied path evidence. Do not invent missing path hops or prescribe a stack.",
  };
}

/** Project Q2 verified component facts into the agent-facing assessment packet. */
export function assessmentFromComponentJustification(question: InterviewQ2Question): InterviewChatAssessment {
  const componentId = question.question.targetRefs.find((target) => target.kind === "component")?.id ?? "unknown";
  return {
    slotId: "component-justification-v2",
    requiredTopics: question.rubric.requiredTopics,
    evidenceSummary: bounded([
      `Target component: ${componentId}.`,
      ...question.evidence.verifiedFacts,
    ]),
    evidenceBasis: question.rubric.evidenceBasis,
    assessGuidance: "Assess purpose, path placement, and one concrete tradeoff using only verifiedFacts. Reject prescribed topology claims.",
    ...(question.rubric.acceptableTradeoffs.length > 0 ? { acceptableTradeoffs: question.rubric.acceptableTradeoffs } : {}),
    ...(question.rubric.forbiddenAssumptions.length > 0 ? { forbiddenAssumptions: question.rubric.forbiddenAssumptions } : {}),
  };
}

/** Project Q4 authored edge-case rubric into the agent-facing assessment packet. */
export function assessmentFromEdgeCase(question: InterviewQ4Question): InterviewChatAssessment {
  return {
    slotId: "challenge-edge-case-v2",
    requiredTopics: question.rubric.requiredTopics,
    evidenceSummary: bounded([
      `Setting: ${question.setting}.`,
      ...question.evidence.verifiedFacts,
      "Simulator scenario evidence is not used for this slot.",
    ]),
    evidenceBasis: question.rubric.evidenceBasis,
    assessGuidance: "Score coverage of requiredTopics and named tradeoffs. Distinguish architecture observations from general reasoning; do not invent simulator outcomes.",
    acceptableTradeoffs: question.rubric.acceptableTradeoffs,
    commonMisconceptions: question.rubric.commonMisconceptions,
  };
}

/** Project modeled failure facts into the agent-facing assessment packet. */
export function assessmentFromFailureQuestion(question: InterviewFailureQuestion): InterviewChatAssessment {
  return {
    slotId: "live-failure-v2",
    requiredTopics: question.rubric.requiredTopics,
    evidenceSummary: bounded(question.evidenceSummary),
    evidenceBasis: question.rubric.evidenceBasis,
    assessGuidance: "Score failure impact, a chat-described recovery of at most two simple changes, and remaining limitation. Do not require canvas edits or invent unstated simulator metrics.",
    acceptableTradeoffs: question.rubric.acceptableTradeoffs,
  };
}

function componentAssessment(context: AgentContext, componentIds: readonly string[]): InterviewChatAssessment {
  const components = context.architecture.components.filter((component) => componentIds.includes(component.id));
  const labels = components.map((component) => `${component.id} (${component.type})`);
  return {
    slotId: "component-justification-v2",
    requiredTopics: ["why this component exists", "role in the request path", "one concrete tradeoff"],
    evidenceSummary: bounded([
      labels.length > 0 ? `Target components: ${labels.join(", ")}.` : "No component targets were supplied.",
      `${context.architecture.components.length} components and ${context.architecture.connections.length} connections are present.`,
    ]),
    evidenceBasis: "player_added_component_path",
    assessGuidance: "Assess purpose, path placement, and one concrete tradeoff using only current architecture evidence. Reject prescribed topology claims.",
    forbiddenAssumptions: ["The component is automatically required.", "The component is a prescribed solution."],
  };
}

/**
 * Attach structured assessment to the agent-visible interview snapshot for chat slots.
 * Simulation questions return undefined; agents use the review packet instead.
 */
export function resolveInterviewAssessment(context: AgentContext, question: InterviewQuestion | null | undefined): InterviewChatAssessment | undefined {
  if (!question) return undefined;
  if (question.kind === "simulation") return undefined;
  if (question.kind === "discussion" && (question.questionId === "opening-1" || question.ordinal === 1)) {
    return assessmentFromRequestPathQuestion(buildRequestPathQuestion(context));
  }
  if (question.kind === "component") return componentAssessment(context, question.componentIds);
  if (question.kind === "discussion") {
    return {
      slotId: "challenge-edge-case-v2",
      requiredTopics: ["current architecture behavior", "named tradeoff", "one failure or scaling implication"],
      evidenceSummary: bounded([
        ...(question.contextSignals ?? []),
        question.focus ? `Focus: ${question.focus}` : "",
        `${context.architecture.components.length} components are present.`,
      ]),
      evidenceBasis: "authored_edge_case_and_general_reasoning",
      assessGuidance: "Evaluate whether the answer covers the required topics using current architecture context and general reasoning. Do not invent simulator results.",
    };
  }
  return undefined;
}
