import type { CapabilityInputSchema, CapabilityInputValidationResult } from "./capability.js";
import type { InterviewEvaluation, InterviewSimulationCritique } from "./interview-state.js";

export const INTERVIEW_EVALUATION_MAX_TEXT_LENGTH = 4_000;
export const INTERVIEW_EVALUATION_MAX_ITEMS = 8;
export const INTERVIEW_SIMULATION_CRITIQUE_MAX_TEXT_LENGTH = 4_000;
export const INTERVIEW_SIMULATION_CRITIQUE_MAX_ITEMS = 8;

export type InterviewEvaluationGrounding =
  | "architecture_evidence"
  | "general_system_design"
  | "insufficient_evidence";

export type InterviewEvaluationResult = InterviewEvaluation & {
  readonly grounding: InterviewEvaluationGrounding;
};

export type InterviewReadiness = "ready" | "follow_up" | "ambiguous";

export const INTERVIEW_ORCHESTRATION_PROMPT_VERSION = "design-interview-orchestration-2" as const;

/** Host-facing lifecycle instructions; the reducer remains the enforcement boundary. */
export function buildInterviewOrchestrationPrompt(): string {
  return [
    `INTERVIEW ORCHESTRATION (${INTERVIEW_ORCHESTRATION_PROMPT_VERSION})`,
    "When the player asks to be interviewed about the current Faultline design, call start_design_interview once and use only the returned current question.",
    "For the first three opening slots, use the returned focus and contextSignals as constraints, inspect current evidence when useful, and write one fresh high-level question tailored to this architecture and challenge. The focus is dynamic; do not recite a fixed template.",
    "Ask exactly one generated question, then wait for the player's answer. Never reveal future questions or the agenda early.",
    "Evaluate the answer against the current question and supplied Faultline evidence, then submit one schema-valid evaluation with submit_interview_answer before presenting the verdict.",
    "Present the verdict as correct, partial, or incorrect, followed by concise explanation, strengths, gaps, and an ideal answer. A verdict never grants permission to advance.",
    "After every evaluation, ask: Would you like to ask a follow-up, or are you ready for the next question?",
    "A technical question, no, not yet, or ambiguous language stays on the current question. Use follow_up_design_interview and answer it without evaluating a new answer or advancing.",
    "Call advance_design_interview only after an explicit readiness signal such as yes, next or I am ready for the next question, and send ready: true with the current IDs.",
    "After advancing, ask only the newly returned question. If a tool retry returns the same IDs, continue the existing turn and do not duplicate the question, answer, or evaluation.",
    "When the current question has phase simulation, present that canvas redesign prompt once and wait while the player edits the real architecture. Do not answer it, prescribe components or topology, run a standalone experiment, or advance with a next acknowledgement.",
    "Treat Review my redesign, I'm done—review it, and similarly explicit wording as review intent. Ordinary edit commentary is not review intent. On review intent, call prepare_interview_simulation_review first, then write a critique only from its bounded packet and call submit_interview_simulation_critique with the exact returned reviewDigest.",
    "For the simulation critique, use only the returned scenario outcomes, metric/requirement deltas, architecture delta, and validation evidence. State one observed strength, one limiting gap, and one next investigation; distinguish simulator facts from general systems reasoning and never prescribe a canonical stack.",
    "If preparation reports no semantic change, an invalid candidate, or a stale digest, explain the recoverable condition and ask the player to edit or retry preparation. Chat prose alone can never complete the interview.",
    "If a tool reports a stale, invalid, or unavailable session, explain the recoverable state and ask the player to restart or clarify; never bypass the tool or infer a transition.",
    "The interview is coaching only: do not edit architecture, submit official attempts, affect leaderboards, run standalone agent-triggered experiments, invent simulator facts, or claim official pass/fail.",
  ].join(" ");
}

export type InterviewEvaluationPromptInput = {
  readonly question: string;
  readonly answer: string;
  readonly evidenceSummary?: string;
};

export type InterviewFollowUpPromptInput = {
  readonly question: string;
  readonly evaluation: InterviewEvaluationResult;
  readonly followUp: string;
};

export type InterviewSimulationCritiquePromptInput = {
  readonly question: string;
  readonly reviewEvidence: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, name: string): { value?: string; error?: string } {
  if (typeof value !== "string" || value.trim().length === 0) return { error: `${name} must be a non-empty string.` };
  if (value.length > INTERVIEW_EVALUATION_MAX_TEXT_LENGTH) return { error: `${name} must be at most ${INTERVIEW_EVALUATION_MAX_TEXT_LENGTH} characters.` };
  return { value };
}

function boundedItems(value: unknown, name: string): { value?: readonly string[]; error?: string } {
  if (!Array.isArray(value) || value.length > INTERVIEW_EVALUATION_MAX_ITEMS) {
    return { error: `${name} must be an array of at most ${INTERVIEW_EVALUATION_MAX_ITEMS} strings.` };
  }
  const items: string[] = [];
  for (const item of value) {
    const parsed = boundedText(item, `${name} item`);
    if (parsed.error) return { error: parsed.error };
    items.push(parsed.value!);
  }
  return { value: items };
}

/** Validate untrusted model output before it is persisted or shown as a verdict. */
export function safeParseInterviewEvaluation(value: unknown): CapabilityInputValidationResult<InterviewEvaluationResult> {
  if (!isRecord(value)) return { success: false, errors: ["Interview evaluation must be an object."] };
  const allowed = new Set(["verdict", "explanation", "strengths", "gaps", "idealAnswer", "confidence", "grounding"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { success: false, errors: ["Interview evaluation contains unknown properties."] };
  }
  if (value.verdict !== "correct" && value.verdict !== "partial" && value.verdict !== "incorrect") {
    return { success: false, errors: ["verdict must be correct, partial, or incorrect."] };
  }
  if (value.grounding !== "architecture_evidence" && value.grounding !== "general_system_design" && value.grounding !== "insufficient_evidence") {
    return { success: false, errors: ["grounding must identify the evidence basis."] };
  }
  if (value.confidence !== undefined && value.confidence !== "high" && value.confidence !== "medium" && value.confidence !== "low") {
    return { success: false, errors: ["confidence must be high, medium, or low."] };
  }
  const explanation = boundedText(value.explanation, "explanation");
  const idealAnswer = boundedText(value.idealAnswer, "idealAnswer");
  const strengths = boundedItems(value.strengths, "strengths");
  const gaps = boundedItems(value.gaps, "gaps");
  const errors = [explanation.error, idealAnswer.error, strengths.error, gaps.error].filter((error): error is string => Boolean(error));
  if (errors.length > 0) return { success: false, errors };
  return {
    success: true,
    data: {
      verdict: value.verdict,
      explanation: explanation.value!,
      strengths: strengths.value!,
      gaps: gaps.value!,
      idealAnswer: idealAnswer.value!,
      grounding: value.grounding,
      ...(value.confidence !== undefined ? { confidence: value.confidence } : {}),
    },
  };
}

export function safeParseInterviewSimulationCritique(value: unknown): CapabilityInputValidationResult<InterviewSimulationCritique> {
  if (!isRecord(value)) return { success: false, errors: ["Simulation critique must be an object."] };
  const allowed = new Set(["verdict", "summary", "strengths", "gaps", "nextStep", "grounding"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return { success: false, errors: ["Simulation critique contains unknown properties."] };
  if (value.verdict !== "satisfies" && value.verdict !== "partially_satisfies" && value.verdict !== "does_not_satisfy") return { success: false, errors: ["verdict must be satisfies, partially_satisfies, or does_not_satisfy."] };
  if (value.grounding !== "simulator_evidence" && value.grounding !== "validation_evidence" && value.grounding !== "insufficient_evidence") return { success: false, errors: ["grounding must identify the evidence basis."] };
  const textValue = (name: string): { value?: string; error?: string } => {
    if (typeof value[name] !== "string" || value[name].trim().length === 0) return { error: `${name} must be a non-empty string.` };
    if ((value[name] as string).length > INTERVIEW_SIMULATION_CRITIQUE_MAX_TEXT_LENGTH) return { error: `${name} must be at most ${INTERVIEW_SIMULATION_CRITIQUE_MAX_TEXT_LENGTH} characters.` };
    return { value: value[name] as string };
  };
  const items = (name: string): { value?: readonly string[]; error?: string } => {
    if (!Array.isArray(value[name]) || (value[name] as unknown[]).length > INTERVIEW_SIMULATION_CRITIQUE_MAX_ITEMS) return { error: `${name} must be an array of at most ${INTERVIEW_SIMULATION_CRITIQUE_MAX_ITEMS} strings.` };
    const parsed = (value[name] as unknown[]).map((item) => typeof item === "string" && item.trim().length > 0 && item.length <= INTERVIEW_SIMULATION_CRITIQUE_MAX_TEXT_LENGTH ? item : undefined);
    if (parsed.some((item) => item === undefined)) return { error: `${name} must contain bounded non-empty strings.` };
    return { value: parsed as string[] };
  };
  const summary = textValue("summary");
  const nextStep = textValue("nextStep");
  const strengths = items("strengths");
  const gaps = items("gaps");
  const errors = [summary.error, nextStep.error, strengths.error, gaps.error].filter((error): error is string => Boolean(error));
  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: { verdict: value.verdict, summary: summary.value!, strengths: strengths.value!, gaps: gaps.value!, nextStep: nextStep.value!, grounding: value.grounding } };
}

export const interviewEvaluationSchema: CapabilityInputSchema<InterviewEvaluationResult> = {
  jsonSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  safeParse: safeParseInterviewEvaluation,
};

/** Conservative readiness classifier: only explicit next-step language advances. */
export function classifyInterviewReadiness(message: string): InterviewReadiness {
  const normalized = message.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (normalized.length === 0) return "ambiguous";
  const explicitReady = /^(yes|yeah|yep|i am ready|i'm ready|ready|next|continue|move on|go ahead)(,?\s*(next|to the next question|please))?$/;
  if (explicitReady.test(normalized) || /^(yes|yeah|yep),?\s+(i am |i'm )?ready\s+(for )?(the )?next/.test(normalized) || /^(i am |i'm )ready\s+(for )?(the )?next/.test(normalized)) return "ready";
  if (/[?]/.test(normalized) || /^(why|how|what|when|where|which|can|could|should|does|do|is|are|would)\b/.test(normalized)) return "follow_up";
  return "ambiguous";
}

export function buildInterviewEvaluationPrompt(input: InterviewEvaluationPromptInput): string {
  return [
    "Evaluate the player's answer to exactly the current design-interview question.",
    "Return only the validated InterviewEvaluationResult shape.",
    "Use correct when the essential behavior and tradeoffs are covered, partial when the direction is right but an important detail is missing, and incorrect when the answer contradicts the architecture or system behavior.",
    "Separate factual gaps from optional improvements. Do not prescribe a single technology stack.",
    "Use architecture_evidence only for claims supported by the supplied current evidence. Use general_system_design for general reasoning and insufficient_evidence when the supplied evidence cannot establish the claim.",
    "Do not reveal future interview questions, advance the interview, edit the architecture, submit an attempt, or claim official pass/fail.",
    `CURRENT QUESTION:\n${input.question}`,
    `PLAYER ANSWER:\n${input.answer}`,
    input.evidenceSummary ? `CURRENT EVIDENCE:\n${input.evidenceSummary}` : "CURRENT EVIDENCE:\nNo simulator evidence was supplied.",
  ].join("\n\n");
}

export function buildInterviewFollowUpPrompt(input: InterviewFollowUpPromptInput): string {
  return [
    "Answer the player's follow-up about the current design-interview question.",
    "Remain on this question. Do not evaluate a new answer, reveal future questions, or advance the interview.",
    "Use the prior evaluation as context, distinguish current architecture evidence from general reasoning, and say when evidence is insufficient.",
    `CURRENT QUESTION:\n${input.question}`,
    `PRIOR EVALUATION:\n${input.evaluation.explanation}`,
    `PLAYER FOLLOW-UP:\n${input.followUp}`,
    "End by asking whether the player has another follow-up or is ready for the next question.",
  ].join("\n\n");
}

export function buildInterviewSimulationCritiquePrompt(input: InterviewSimulationCritiquePromptInput): string {
  return [
    "Critique the player's canvas redesign using only the returned Faultline simulation review packet.",
    "Return only the validated InterviewSimulationCritique shape with verdict satisfies, partially_satisfies, or does_not_satisfy.",
    "Cite observed scenario metrics, requirement outcomes, cost/tradeoff, architecture delta, or validation errors from the packet. Identify one strength, one limiting gap, and one next investigation. Label general systems reasoning as inference, do not invent simulator facts, prescribe a canonical stack, or claim official pass/fail.",
    "The critique is coaching evidence only and must be submitted with the packet's exact reviewDigest. Do not complete from the player's prose or from an earlier packet.",
    `CURRENT SIMULATION QUESTION:\n${input.question}`,
    `RETURNED REVIEW PACKET:\n${input.reviewEvidence}`,
  ].join("\n\n");
}
