"use client";

import {
  buildStartDesignInterviewOutput,
  createInterviewState,
  transitionInterview,
  type InterviewEvaluation,
  type InterviewEvent,
  type InterviewQuestion,
  type InterviewState,
  type PresentationCue,
} from "@faultline/agent-capabilities";
import type { AgentContext } from "@faultline/agent-capabilities";

import {
  BrowserInterviewStorageError,
  createBrowserInterviewRepository,
  getBrowserInterviewOwnerKey,
  type BrowserInterviewRecord,
} from "./interview-storage.ts";

export type InterviewServiceSnapshot = {
  readonly state: InterviewState;
  readonly question: InterviewQuestion | null;
  readonly presentationCue?: PresentationCue;
  readonly storageRevision: number;
};

export class DesignInterviewServiceError extends Error {
  override name = "DesignInterviewServiceError";
  readonly code:
    | "NO_INTERVIEW"
    | "STALE_ARCHITECTURE"
    | "INVALID_INPUT"
    | "CONFLICT"
    | "STORAGE_UNAVAILABLE"
    | "STORAGE_MALFORMED"
    | "STORAGE_TOO_LARGE";
  constructor(
    message: string,
    code:
      | "NO_INTERVIEW"
      | "STALE_ARCHITECTURE"
      | "INVALID_INPUT"
      | "CONFLICT"
      | "STORAGE_UNAVAILABLE"
      | "STORAGE_MALFORMED"
      | "STORAGE_TOO_LARGE",
  ) {
    super(message);
    this.code = code;
  }
}

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + "-" + value;
}

function currentRevision(context: AgentContext): string {
  return context.evidenceMeta?.architectureRevision ?? "unversioned";
}

function questionsFor(context: AgentContext): readonly InterviewQuestion[] {
  const first = buildStartDesignInterviewOutput(context, { step: 0 });
  if (!first.ok) throw new DesignInterviewServiceError(first.message, "INVALID_INPUT");
  const questions: InterviewQuestion[] = [];
  for (let step = 0; step < first.data.totalQuestions; step += 1) {
    const output = buildStartDesignInterviewOutput(context, { step });
    if (!output.ok) throw new DesignInterviewServiceError(output.message, "INVALID_INPUT");
    questions.push({
      questionId: output.data.questionId,
      ordinal: step + 1,
      phase: output.data.phase,
      prompt: output.data.question,
      componentIds: output.data.componentIds,
      grouped: output.data.grouped,
    });
  }
  return questions;
}

function questionOutput(context: AgentContext, state: InterviewState) {
  if (!state.currentQuestion) return undefined;
  const output = buildStartDesignInterviewOutput(context, { step: state.questionOrdinal - 1 });
  if (!output.ok) throw new DesignInterviewServiceError(output.message, "INVALID_INPUT");
  return output.data;
}

function snapshot(context: AgentContext, record: BrowserInterviewRecord): InterviewServiceSnapshot {
  const output = questionOutput(context, record.state);
  return {
    state: record.state,
    question: record.state.currentQuestion,
    ...(output?.presentationCue ? { presentationCue: output.presentationCue } : {}),
    storageRevision: record.revision,
  };
}

function serviceError(error: unknown): DesignInterviewServiceError {
  if (error instanceof DesignInterviewServiceError) return error;
  if (error instanceof BrowserInterviewStorageError) {
    return new DesignInterviewServiceError(
      error.message,
      error.code === "conflict" ? "CONFLICT" : error.code === "too_large" ? "STORAGE_TOO_LARGE" : error.code === "malformed" ? "STORAGE_MALFORMED" : "STORAGE_UNAVAILABLE",
    );
  }
  return new DesignInterviewServiceError("Design interview storage failed.", "STORAGE_UNAVAILABLE");
}

function ensureCurrent(context: AgentContext, record: BrowserInterviewRecord): void {
  if (record.state.architectureRevision !== currentRevision(context)) {
    throw new DesignInterviewServiceError(
      "The architecture changed since this interview started. Restart the interview on the current design.",
      "STALE_ARCHITECTURE",
    );
  }
}

function commit(
  context: AgentContext,
  repository: ReturnType<typeof createBrowserInterviewRepository>,
  record: BrowserInterviewRecord,
  event: InterviewEvent,
  nextState: InterviewState,
): InterviewServiceSnapshot {
  const eventId = event.type === "answer"
    ? event.answerId
    : event.type === "follow_up"
      ? event.followUpId
      : event.type === "advance"
        ? event.type + "-" + event.advancedAt
        : event.type;
  const next = repository.commit({
    expectedRevision: record.revision,
    eventId,
    event,
    state: nextState,
  });
  return snapshot(context, next);
}

/** Browser-scoped interview lifecycle. The external model supplies evaluation prose; this service enforces transitions. */
export function createDesignInterviewService(ownerKey = getBrowserInterviewOwnerKey()) {
  const repository = createBrowserInterviewRepository(ownerKey);

  function load(): BrowserInterviewRecord {
    const record = repository.load();
    if (!record) throw new DesignInterviewServiceError("No active design interview.", "NO_INTERVIEW");
    return record;
  }

  return {
    start(context: AgentContext): InterviewServiceSnapshot {
      try {
        const existing = repository.load();
        if (existing) return snapshot(context, existing);
        const questions = questionsFor(context);
        const started = createInterviewState({
          type: "start",
          interviewId: id("interview"),
          architectureRevision: currentRevision(context),
          challengeId: context.challenge.slug,
          questions,
          startedAt: now(),
        });
        if (!started.ok) throw new DesignInterviewServiceError(started.message, "INVALID_INPUT");
        const event: InterviewEvent = {
          type: "start",
          interviewId: started.state.interviewId,
          architectureRevision: started.state.architectureRevision,
          ...(started.state.challengeId ? { challengeId: started.state.challengeId } : {}),
          questions,
          startedAt: started.state.startedAt,
        };
        return snapshot(context, repository.saveStarted(started.state, event));
      } catch (error) {
        throw serviceError(error);
      }
    },

    get(context: AgentContext): InterviewServiceSnapshot {
      try {
        const record = load();
        return snapshot(context, record);
      } catch (error) {
        throw serviceError(error);
      }
    },

    submitAnswer(context: AgentContext, input: { questionId: string; answerId?: string; answer: string; evaluation: InterviewEvaluation }): InterviewServiceSnapshot {
      try {
        const record = load();
        ensureCurrent(context, record);
        const event: InterviewEvent = {
          type: "answer",
          questionId: input.questionId,
          answerId: input.answerId ?? id("answer"),
          answer: input.answer,
          evaluation: input.evaluation,
          createdAt: now(),
        };
        const next = transitionInterview(record.state, event);
        if (!next.ok) throw new DesignInterviewServiceError(next.message, next.code === "WRONG_QUESTION" ? "INVALID_INPUT" : next.code === "INTERVIEW_STALE" ? "STALE_ARCHITECTURE" : "INVALID_INPUT");
        return commit(context, repository, record, event, next.state);
      } catch (error) {
        throw serviceError(error);
      }
    },

    followUp(context: AgentContext, input: { questionId: string; followUpId?: string; question: string; answer: string }): InterviewServiceSnapshot {
      try {
        const record = load();
        ensureCurrent(context, record);
        const event: InterviewEvent = {
          type: "follow_up",
          questionId: input.questionId,
          followUpId: input.followUpId ?? id("follow-up"),
          question: input.question,
          answer: input.answer,
          createdAt: now(),
        };
        const next = transitionInterview(record.state, event);
        if (!next.ok) throw new DesignInterviewServiceError(next.message, next.code === "INTERVIEW_STALE" ? "STALE_ARCHITECTURE" : "INVALID_INPUT");
        return commit(context, repository, record, event, next.state);
      } catch (error) {
        throw serviceError(error);
      }
    },

    advance(context: AgentContext, input: { questionId: string; ready: true }): InterviewServiceSnapshot {
      try {
        const record = load();
        ensureCurrent(context, record);
        const event: InterviewEvent = {
          type: "advance",
          questionId: input.questionId,
          ready: true,
          advancedAt: now(),
        };
        const next = transitionInterview(record.state, event);
        if (!next.ok) throw new DesignInterviewServiceError(next.message, next.code === "INTERVIEW_STALE" ? "STALE_ARCHITECTURE" : next.code === "WRONG_QUESTION" || next.code === "ANSWER_REQUIRED" || next.code === "NOT_READY" ? "INVALID_INPUT" : "INVALID_INPUT");
        return commit(context, repository, record, event, next.state);
      } catch (error) {
        throw serviceError(error);
      }
    },

    end(context: AgentContext): InterviewServiceSnapshot {
      try {
        const record = load();
        const event: InterviewEvent = { type: "abandon" };
        const next = transitionInterview(record.state, event);
        if (!next.ok) throw new DesignInterviewServiceError(next.message, "INVALID_INPUT");
        return commit(context, repository, record, event, next.state);
      } catch (error) {
        throw serviceError(error);
      }
    },

    clear(): void {
      try {
        repository.clear();
      } catch (error) {
        throw serviceError(error);
      }
    },
  };
}
