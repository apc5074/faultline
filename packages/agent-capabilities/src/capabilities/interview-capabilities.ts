import type { AgentCapability, CapabilityExecutionOptions, CapabilityInputSchema } from "../capability.js";
import type { AgentContext } from "../context.js";
import type { InterviewService, InterviewServiceSnapshot } from "../interview-service-port.js";
import { safeParseInterviewEvaluation, safeParseInterviewSimulationCritique } from "../interview-protocol.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "../result.js";

type SessionCapability<TInput> = AgentCapability<AgentContext, TInput, CapabilityResult<InterviewServiceSnapshot>>;
type QuestionInput = { readonly interviewId: string; readonly questionId: string };
export type SubmitInterviewAnswerInput = QuestionInput & { readonly answerId?: string; readonly answer: string; readonly evaluation: unknown };
export type FollowUpInterviewInput = QuestionInput & { readonly followUpId?: string; readonly question: string; readonly answer: string };
export type AdvanceInterviewInput = QuestionInput & { readonly ready: true };
export type EndInterviewInput = { readonly interviewId: string };
export type PrepareSimulationReviewInput = QuestionInput;
export type SubmitSimulationCritiqueInput = QuestionInput & { readonly reviewDigest: string; readonly candidateArchitectureRevision: string; readonly critique: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sessionSchema<T>(name: string, properties: unknown, required: readonly string[], parse: (value: unknown) => T | string): CapabilityInputSchema<T> {
  return {
    jsonSchema: { type: "object", properties, required, additionalProperties: false } as CapabilityInputSchema<T>["jsonSchema"],
    safeParse(value) {
      const parsed = parse(value);
      return typeof parsed === "string" ? { success: false as const, errors: [`${name}: ${parsed}`] } : { success: true as const, data: parsed };
    },
  };
}

function service(options?: CapabilityExecutionOptions): InterviewService | undefined {
  return options?.interviewService;
}

function executeWithService<T>(
  operation: (context: AgentContext, input: T, interview: InterviewService) => InterviewServiceSnapshot | Promise<InterviewServiceSnapshot>,
): SessionCapability<T>["execute"] {
  return async (context, input, options) => {
    const interview = service(options);
    if (!interview) return capabilityError("NOT_FOUND", "Interview session is unavailable in this host.");
    try {
      return capabilityOk(await operation(context, input, interview));
    } catch (error) {
      return capabilityError("INVALID_INPUT", error instanceof Error ? error.message : "Interview operation failed.");
    }
  };
}

function verifyInterview(snapshot: InterviewServiceSnapshot, interviewId: string, questionId?: string): void {
  if (snapshot.state.interviewId !== interviewId) throw new Error("Interview ID does not match the active interview.");
  if (questionId !== undefined && snapshot.state.currentQuestion?.questionId !== questionId) throw new Error("Question ID does not match the current interview question.");
}

const questionProperties = {
  interviewId: { type: "string", minLength: 1 },
  questionId: { type: "string", minLength: 1 },
};

export const getDesignInterviewCapability: SessionCapability<QuestionInput> = {
  name: "get_design_interview",
  description: "Read the current browser-scoped design interview state for the supplied interview and question IDs.",
  inputSchema: sessionSchema("get_design_interview", questionProperties, ["interviewId", "questionId"], (value) => {
    if (!isRecord(value) || !text(value.interviewId) || !text(value.questionId)) return "interviewId and questionId are required.";
    return { interviewId: value.interviewId, questionId: value.questionId };
  }),
  mode: "read",
  availableWhen: () => true,
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute: executeWithService(async (context, input, interview) => {
    const snapshot = await interview.get(context);
    verifyInterview(snapshot, input.interviewId, input.questionId);
    return snapshot;
  }),
};

export const submitInterviewAnswerCapability: SessionCapability<SubmitInterviewAnswerInput> = {
  name: "submit_interview_answer",
  description: "Submit one evaluated answer for the current interview question without advancing.",
  inputSchema: sessionSchema("submit_interview_answer", { ...questionProperties, answerId: { type: "string", minLength: 1 }, answer: { type: "string", minLength: 1 }, evaluation: { type: "object" } }, ["interviewId", "questionId", "answer", "evaluation"], (value) => {
    if (!isRecord(value) || !text(value.interviewId) || !text(value.questionId) || !text(value.answer) || value.evaluation === undefined) return "interviewId, questionId, answer, and evaluation are required.";
    return { interviewId: value.interviewId, questionId: value.questionId, ...(text(value.answerId) ? { answerId: value.answerId } : {}), answer: value.answer, evaluation: value.evaluation };
  }),
  mode: "session",
  availableWhen: () => true,
  annotations: { idempotentHint: true },
  execute: executeWithService(async (context, input, interview) => {
    const evaluation = safeParseInterviewEvaluation(input.evaluation);
    if (!evaluation.success) throw new Error(evaluation.errors.join(" "));
    const snapshot = await interview.submitAnswer(context, { ...input, evaluation: evaluation.data });
    verifyInterview(snapshot, input.interviewId);
    return snapshot;
  }),
};

export const followUpDesignInterviewCapability: SessionCapability<FollowUpInterviewInput> = {
  name: "follow_up_design_interview",
  description: "Answer a follow-up about the current question without advancing the interview.",
  inputSchema: sessionSchema("follow_up_design_interview", { ...questionProperties, followUpId: { type: "string", minLength: 1 }, question: { type: "string", minLength: 1 }, answer: { type: "string", minLength: 1 } }, ["interviewId", "questionId", "question", "answer"], (value) => {
    if (!isRecord(value) || !text(value.interviewId) || !text(value.questionId) || !text(value.question) || !text(value.answer)) return "interviewId, questionId, question, and answer are required.";
    return { interviewId: value.interviewId, questionId: value.questionId, ...(text(value.followUpId) ? { followUpId: value.followUpId } : {}), question: value.question, answer: value.answer };
  }),
  mode: "session",
  availableWhen: () => true,
  annotations: { idempotentHint: true },
  execute: executeWithService(async (context, input, interview) => {
    const snapshot = await interview.followUp(context, input);
    verifyInterview(snapshot, input.interviewId, input.questionId);
    return snapshot;
  }),
};

export const advanceDesignInterviewCapability: SessionCapability<AdvanceInterviewInput> = {
  name: "advance_design_interview",
  description: "Advance exactly one interview question after the player explicitly says they are ready.",
  inputSchema: sessionSchema("advance_design_interview", { ...questionProperties, ready: { type: "boolean" } }, ["interviewId", "questionId", "ready"], (value) => {
    if (!isRecord(value) || !text(value.interviewId) || !text(value.questionId) || value.ready !== true) return "interviewId, questionId, and ready: true are required.";
    return { interviewId: value.interviewId, questionId: value.questionId, ready: true };
  }),
  mode: "session",
  availableWhen: () => true,
  annotations: { idempotentHint: true },
  execute: executeWithService(async (context, input, interview) => {
    const snapshot = await interview.advance(context, input);
    verifyInterview(snapshot, input.interviewId);
    return snapshot;
  }),
};

export const endDesignInterviewCapability: SessionCapability<EndInterviewInput> = {
  name: "end_design_interview",
  description: "End the active browser-scoped interview without changing architecture or official state.",
  inputSchema: sessionSchema("end_design_interview", { interviewId: { type: "string", minLength: 1 } }, ["interviewId"], (value) => {
    if (!isRecord(value) || !text(value.interviewId)) return "interviewId is required.";
    return { interviewId: value.interviewId };
  }),
  mode: "session",
  availableWhen: () => true,
  annotations: { idempotentHint: true },
  execute: executeWithService(async (context, input, interview) => {
    const snapshot = await interview.end(context);
    verifyInterview(snapshot, input.interviewId);
    return snapshot;
  }),
};

export const restartDesignInterviewCapability: SessionCapability<Record<string, never>> = {
  name: "restart_design_interview",
  description: "Explicitly start a new design interview on the current architecture while preserving the prior browser-scoped interview in history.",
  inputSchema: sessionSchema("restart_design_interview", {}, [], (value) => {
    if (value !== undefined && value !== null && (!isRecord(value) || Object.keys(value).length > 0)) return "restart_design_interview input must be an empty object.";
    return {};
  }),
  mode: "session",
  availableWhen: () => true,
  annotations: { idempotentHint: false },
  execute: executeWithService(async (context, _input, interview) => interview.restart(context)),
};

export const prepareInterviewSimulationReviewCapability: SessionCapability<PrepareSimulationReviewInput> = {
  name: "prepare_interview_simulation_review",
  description: "Evaluate the original and redesigned architectures under the fixed interview simulation scenario and return digest-bound coaching evidence.",
  inputSchema: sessionSchema("prepare_interview_simulation_review", questionProperties, ["interviewId", "questionId"], (value) => {
    if (!isRecord(value) || !text(value.interviewId) || !text(value.questionId)) return "interviewId and questionId are required.";
    return { interviewId: value.interviewId, questionId: value.questionId };
  }),
  mode: "session",
  availableWhen: () => true,
  annotations: { idempotentHint: true },
  execute: executeWithService(async (context, input, interview) => {
    if (!interview.prepareSimulationReview) throw new Error("Simulation review is unavailable in this host.");
    const snapshot = await interview.prepareSimulationReview(context, input);
    verifyInterview(snapshot, input.interviewId, input.questionId);
    return snapshot;
  }),
};

export const submitInterviewSimulationCritiqueCapability: SessionCapability<SubmitSimulationCritiqueInput> = {
  name: "submit_interview_simulation_critique",
  description: "Save a bounded critique grounded in the current digest-bound simulation review and complete the interview.",
  inputSchema: sessionSchema("submit_interview_simulation_critique", { ...questionProperties, reviewDigest: { type: "string", minLength: 1 }, candidateArchitectureRevision: { type: "string", minLength: 1 }, critique: { type: "object" } }, ["interviewId", "questionId", "reviewDigest", "candidateArchitectureRevision", "critique"], (value) => {
    if (!isRecord(value) || !text(value.interviewId) || !text(value.questionId) || !text(value.reviewDigest) || !text(value.candidateArchitectureRevision) || value.critique === undefined) return "interviewId, questionId, reviewDigest, candidateArchitectureRevision, and critique are required.";
    return { interviewId: value.interviewId, questionId: value.questionId, reviewDigest: value.reviewDigest, candidateArchitectureRevision: value.candidateArchitectureRevision, critique: value.critique };
  }),
  mode: "session",
  availableWhen: () => true,
  annotations: { idempotentHint: true },
  execute: executeWithService(async (context, input, interview) => {
    if (!interview.submitSimulationCritique) throw new Error("Simulation critique is unavailable in this host.");
    const critique = safeParseInterviewSimulationCritique(input.critique);
    if (!critique.success) throw new Error(critique.errors.join(" "));
    const snapshot = await interview.submitSimulationCritique(context, { ...input, critique: critique.data });
    verifyInterview(snapshot, input.interviewId);
    return snapshot;
  }),
};

export const DESIGN_INTERVIEW_CAPABILITIES = [
  getDesignInterviewCapability,
  submitInterviewAnswerCapability,
  followUpDesignInterviewCapability,
  advanceDesignInterviewCapability,
  endDesignInterviewCapability,
  restartDesignInterviewCapability,
  prepareInterviewSimulationReviewCapability,
  submitInterviewSimulationCritiqueCapability,
] as const;
