"use client";

import {
  buildStartDesignInterviewOutput,
  createInterviewState,
  resolveInterviewAssessment,
  transitionInterview,
  type InterviewChatAssessment,
  type InterviewEvaluation,
  type InterviewEvent,
  type InterviewQuestion,
  type InterviewState,
  type PresentationCue,
} from "@faultline/agent-capabilities";
import type { AgentContext } from "@faultline/agent-capabilities";
import type { InterviewSimulationCritique, InterviewSimulationReviewPacket } from "@faultline/agent-capabilities";
import { architectureEvidenceFingerprint } from "@faultline/agent-capabilities";
import { componentRegistry } from "@faultline/component-catalog";
import { compareArchitectureScenario } from "@faultline/simulator";
import type { ArchitectureScenarioComparison } from "@faultline/core";

import {
  BrowserInterviewStorageError,
  createBrowserInterviewRepository,
  getBrowserInterviewOwnerKey,
  type BrowserInterviewRecord,
} from "./interview-storage.ts";

export type InterviewServiceSnapshot = {
  readonly state: InterviewState;
  readonly question: InterviewQuestion | null;
  readonly assessment?: InterviewChatAssessment;
  readonly presentationCue?: PresentationCue;
  readonly storageRevision: number;
  readonly simulationReview?: InterviewSimulationReviewPacket;
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

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function digestFor(input: { interviewId: string; questionId: string; scenario: unknown; originalRevision: string; candidateRevision: string; challengeId: string; challengeVersion: number; simulatorVersion: string; comparison: ArchitectureScenarioComparison }): string {
  const source = stable(input);
  let left = 2166136261;
  let right = 2246822519;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left = Math.imul(left ^ code, 16777619);
    right = Math.imul(right ^ (code + index), 3266489917);
  }
  return `review-${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
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

function questionsFor(context: AgentContext, baselineArchitectureRevision: string): readonly InterviewQuestion[] {
  const first = buildStartDesignInterviewOutput(context, { step: 0, baselineArchitectureRevision });
  if (!first.ok) throw new DesignInterviewServiceError(first.message, "INVALID_INPUT");
  const questions: InterviewQuestion[] = [];
  for (let step = 0; step < first.data.totalQuestions; step += 1) {
    const output = buildStartDesignInterviewOutput(context, { step, baselineArchitectureRevision });
    if (!output.ok) throw new DesignInterviewServiceError(output.message, "INVALID_INPUT");
    const shared = {
      questionId: output.data.questionId,
      ordinal: step + 1,
      prompt: output.data.question,
      componentIds: output.data.componentIds,
      grouped: output.data.grouped,
      ...(output.data.focus ? { focus: output.data.focus } : {}),
      ...(output.data.contextSignals ? { contextSignals: output.data.contextSignals } : {}),
    };
    questions.push(output.data.phase === "opening"
      ? { ...shared, kind: "discussion", phase: "opening" }
      : output.data.phase === "component"
        ? { ...shared, kind: "component", phase: "component" }
        : {
            ...shared,
            kind: "simulation",
            phase: "simulation",
            questionId: "simulation-traffic-double-v1",
            componentIds: [],
            grouped: false,
            scenario: output.data.scenario!,
            sourceChallengeId: output.data.sourceChallengeId!,
            baselineArchitectureRevision: output.data.baselineArchitectureRevision!,
          });
  }
  return questions;
}

function questionOutput(context: AgentContext, state: InterviewState) {
  if (!state.currentQuestion) return undefined;
  const output = buildStartDesignInterviewOutput(context, { step: state.questionOrdinal - 1, baselineArchitectureRevision: state.currentQuestion.kind === "simulation" ? state.currentQuestion.baselineArchitectureRevision : state.architectureRevision });
  if (!output.ok) throw new DesignInterviewServiceError(output.message, "INVALID_INPUT");
  return output.data;
}

function snapshot(context: AgentContext, record: BrowserInterviewRecord, includePresentationCue = true): InterviewServiceSnapshot {
  const output = questionOutput(context, record.state);
  const assessment = resolveInterviewAssessment(context, record.state.currentQuestion);
  return {
    state: record.state,
    question: record.state.currentQuestion,
    ...(assessment ? { assessment } : {}),
    ...(includePresentationCue && output?.presentationCue ? { presentationCue: output.presentationCue } : {}),
    storageRevision: record.revision,
  };
}

function reviewPacket(comparison: ArchitectureScenarioComparison, reviewDigest: string): InterviewSimulationReviewPacket {
  return {
    questionId: comparison.scenario.type === "traffic_multiplier" ? "simulation-traffic-double-v1" : "simulation-traffic-double-v1",
    reviewDigest,
    comparison,
    generatedAt: now(),
    official: false,
    simulated: true,
    architectureChangedByAgent: false,
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
  const state = record.state;
  const challengeChanged = state.challengeId !== undefined && state.challengeId !== context.challenge.slug;
  const challengeVersionChanged = state.challengeVersion !== undefined && state.challengeVersion !== context.challenge.version;
  const simulatorVersionChanged = state.simulatorVersion !== undefined && state.simulatorVersion !== context.evidenceMeta?.simulatorVersion;
  if (challengeChanged || challengeVersionChanged || simulatorVersionChanged || (state.phase !== "simulation" && state.architectureRevision !== currentRevision(context))) {
    throw new DesignInterviewServiceError(
      "The architecture changed since this interview started. Restart the interview on the current design.",
      "STALE_ARCHITECTURE",
    );
  }
}

function markStale(context: AgentContext, repository: ReturnType<typeof createBrowserInterviewRepository>, record: BrowserInterviewRecord): InterviewServiceSnapshot {
  if (record.state.status === "stale") return snapshot(context, record);
  const event: InterviewEvent = { type: "stale", staleAt: now() };
  const next = transitionInterview(record.state, event);
  if (!next.ok) throw new DesignInterviewServiceError(next.message, "STALE_ARCHITECTURE");
  return commit(context, repository, record, event, next.state);
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
        ? event.type + "-" + String(record.revision + 1)
        : event.type === "stale"
        ? event.type + "-" + String(record.revision + 1)
        : event.type === "simulation_candidate_changed"
          ? event.type + "-" + String(record.revision + 1)
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
  const listeners = new Set<(snapshot: InterviewServiceSnapshot) => void>();

  function publish(value: InterviewServiceSnapshot): InterviewServiceSnapshot {
    listeners.forEach((listener) => listener(value));
    return value;
  }

  function load(): BrowserInterviewRecord {
    const record = repository.load();
    if (!record) throw new DesignInterviewServiceError("No active design interview.", "NO_INTERVIEW");
    return record;
  }

  function ensureCurrentOrMark(context: AgentContext, record: BrowserInterviewRecord): void {
    try {
      ensureCurrent(context, record);
    } catch (error) {
      if (error instanceof DesignInterviewServiceError && error.code === "STALE_ARCHITECTURE") {
        publish(markStale(context, repository, record));
      }
      throw error;
    }
  }

  return {
    start(context: AgentContext): InterviewServiceSnapshot {
      try {
        const existing = repository.load();
        if (existing) return publish(snapshot(context, existing));
        const questions = questionsFor(context, currentRevision(context));
        const started = createInterviewState({
          type: "start",
          interviewId: id("interview"),
          architectureRevision: currentRevision(context),
          challengeId: context.challenge.slug,
          challengeVersion: context.challenge.version,
          questions,
          startedAt: now(),
        });
        if (!started.ok) throw new DesignInterviewServiceError(started.message, "INVALID_INPUT");
        const event: InterviewEvent = {
          type: "start",
          interviewId: started.state.interviewId,
          architectureRevision: started.state.architectureRevision,
          ...(started.state.challengeId ? { challengeId: started.state.challengeId } : {}),
          ...(started.state.challengeVersion !== undefined ? { challengeVersion: started.state.challengeVersion } : {}),
          ...(started.state.simulatorVersion !== undefined ? { simulatorVersion: started.state.simulatorVersion } : {}),
          questions,
          startedAt: started.state.startedAt,
        };
        return publish(snapshot(context, repository.saveStarted(started.state, event, context.architecture)));
      } catch (error) {
        throw serviceError(error);
      }
    },

    restart(context: AgentContext): InterviewServiceSnapshot {
      try {
        const previous = load();
        const questions = questionsFor(context, currentRevision(context));
        const started = createInterviewState({
          type: "start",
          interviewId: id("interview"),
          architectureRevision: currentRevision(context),
          challengeId: context.challenge.slug,
          challengeVersion: context.challenge.version,
          questions,
          startedAt: now(),
        });
        if (!started.ok) throw new DesignInterviewServiceError(started.message, "INVALID_INPUT");
        const event: InterviewEvent = {
          type: "start",
          interviewId: started.state.interviewId,
          architectureRevision: started.state.architectureRevision,
          ...(started.state.challengeId ? { challengeId: started.state.challengeId } : {}),
          ...(started.state.challengeVersion !== undefined ? { challengeVersion: started.state.challengeVersion } : {}),
          ...(started.state.simulatorVersion !== undefined ? { simulatorVersion: started.state.simulatorVersion } : {}),
          questions,
          startedAt: started.state.startedAt,
        };
        return publish(snapshot(context, repository.saveRestarted(previous, started.state, event, context.architecture)));
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

    syncArchitecture(context: AgentContext): InterviewServiceSnapshot {
      try {
        const record = load();
        ensureCurrentOrMark(context, record);
        if (record.state.phase !== "simulation" || record.state.status === "stale" || record.state.status === "completed" || record.state.status === "abandoned") {
          return snapshot(context, record);
        }
        const revision = currentRevision(context);
        if (record.state.candidateArchitectureRevision === revision) return snapshot(context, record);
        const event: InterviewEvent = { type: "simulation_candidate_changed", candidateArchitectureRevision: revision, changedAt: now() };
        const next = transitionInterview(record.state, event);
        if (!next.ok) throw new DesignInterviewServiceError(next.message, "INVALID_INPUT");
        return publish(commit(context, repository, record, event, next.state));
      } catch (error) {
        throw serviceError(error);
      }
    },

    prepareSimulationReview(context: AgentContext, input: { interviewId: string; questionId: string }): InterviewServiceSnapshot {
      try {
        let record = load();
        if (record.state.interviewId !== input.interviewId || record.state.currentQuestion?.questionId !== input.questionId) throw new DesignInterviewServiceError("Interview or question ID does not match the active simulation.", "INVALID_INPUT");
        if (record.state.phase !== "simulation" || record.state.currentQuestion?.kind !== "simulation") throw new DesignInterviewServiceError("Simulation review is only available for the simulation question.", "INVALID_INPUT");
        const question = record.state.currentQuestion;
        if (record.state.candidateArchitectureRevision !== currentRevision(context)) {
          const candidateEvent: InterviewEvent = { type: "simulation_candidate_changed", candidateArchitectureRevision: currentRevision(context), changedAt: now() };
          const candidateNext = transitionInterview(record.state, candidateEvent);
          if (!candidateNext.ok) throw new DesignInterviewServiceError(candidateNext.message, "INVALID_INPUT");
          commit(context, repository, record, candidateEvent, candidateNext.state);
          record = load();
        }
        if (record.state.status !== "awaiting_design_change" && record.state.status !== "awaiting_simulation_critique") throw new DesignInterviewServiceError("The simulation review is not available in the current interview state.", "INVALID_INPUT");
        if (record.state.candidateArchitectureRevision === question.baselineArchitectureRevision) throw new DesignInterviewServiceError("Change the design on the canvas before requesting review.", "INVALID_INPUT");
        const comparison = compareArchitectureScenario({
          originalArchitecture: record.baselineArchitecture,
          candidateArchitecture: context.architecture,
          challenge: context.challenge,
          registry: componentRegistry,
          scenario: question.scenario,
        });
        const candidateRevision = record.state.candidateArchitectureRevision ?? architectureEvidenceFingerprint(context.architecture);
        const reviewDigest = digestFor({ interviewId: input.interviewId, questionId: input.questionId, scenario: question.scenario, originalRevision: question.baselineArchitectureRevision, candidateRevision, challengeId: context.challenge.slug, challengeVersion: context.challenge.version, simulatorVersion: comparison.simulatorVersion, comparison });
        if (record.state.preparedSimulationReview?.reviewDigest === reviewDigest && record.state.preparedSimulationReview.candidateArchitectureRevision === candidateRevision) {
          return { ...snapshot(context, record), simulationReview: reviewPacket(comparison, reviewDigest) };
        }
        const event: InterviewEvent = { type: "prepare_simulation_review", questionId: input.questionId, candidateArchitectureRevision: candidateRevision, reviewDigest, preparedAt: now() };
        const next = transitionInterview(record.state, event);
        if (!next.ok) throw new DesignInterviewServiceError(next.message, "INVALID_INPUT");
        const committed = commit(context, repository, record, event, next.state);
        return { ...committed, simulationReview: reviewPacket(comparison, reviewDigest) };
      } catch (error) {
        throw serviceError(error);
      }
    },

    submitSimulationCritique(context: AgentContext, input: { interviewId: string; questionId: string; reviewDigest: string; candidateArchitectureRevision: string; critique: InterviewSimulationCritique }): InterviewServiceSnapshot {
      try {
        const record = load();
        if (record.state.status === "completed" && record.state.simulationCritique && input.questionId === "simulation-traffic-double-v1" && record.state.preparedSimulationReview?.reviewDigest === input.reviewDigest && record.state.preparedSimulationReview.candidateArchitectureRevision === input.candidateArchitectureRevision) {
          return snapshot(context, record);
        }
        if (record.state.interviewId !== input.interviewId || record.state.currentQuestion?.questionId !== input.questionId) throw new DesignInterviewServiceError("Interview or question ID does not match the active simulation.", "INVALID_INPUT");
        ensureCurrentOrMark(context, record);
        const current = load();
        const question = current.state.currentQuestion;
        if (!question || question.kind !== "simulation") throw new DesignInterviewServiceError("The simulation question is no longer active.", "INVALID_INPUT");
        const comparison = compareArchitectureScenario({
          originalArchitecture: current.baselineArchitecture,
          candidateArchitecture: context.architecture,
          challenge: context.challenge,
          registry: componentRegistry,
          scenario: question.scenario,
        });
        const event: InterviewEvent = { type: "simulation_critique", questionId: input.questionId, candidateArchitectureRevision: input.candidateArchitectureRevision, reviewDigest: input.reviewDigest, critique: input.critique, completedAt: now() };
        const next = transitionInterview(current.state, event);
        if (!next.ok) throw new DesignInterviewServiceError(next.message, "INVALID_INPUT");
        return { ...commit(context, repository, current, event, next.state), simulationReview: reviewPacket(comparison, input.reviewDigest) };
      } catch (error) {
        throw serviceError(error);
      }
    },

    submitAnswer(context: AgentContext, input: { questionId: string; answerId?: string; answer: string; evaluation: InterviewEvaluation }): InterviewServiceSnapshot {
      try {
        const record = load();
        ensureCurrentOrMark(context, record);
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
        return publish({ ...commit(context, repository, record, event, next.state), presentationCue: undefined });
      } catch (error) {
        throw serviceError(error);
      }
    },

    followUp(context: AgentContext, input: { questionId: string; followUpId?: string; question: string; answer: string }): InterviewServiceSnapshot {
      try {
        const record = load();
        ensureCurrentOrMark(context, record);
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
        return publish({ ...commit(context, repository, record, event, next.state), presentationCue: undefined });
      } catch (error) {
        throw serviceError(error);
      }
    },

    advance(context: AgentContext, input: { questionId: string; ready: true }): InterviewServiceSnapshot {
      try {
        const record = load();
        ensureCurrentOrMark(context, record);
        const event: InterviewEvent = {
          type: "advance",
          questionId: input.questionId,
          ready: true,
          advancedAt: now(),
        };
        const next = transitionInterview(record.state, event);
        if (!next.ok) throw new DesignInterviewServiceError(next.message, next.code === "INTERVIEW_STALE" ? "STALE_ARCHITECTURE" : next.code === "WRONG_QUESTION" || next.code === "ANSWER_REQUIRED" || next.code === "NOT_READY" ? "INVALID_INPUT" : "INVALID_INPUT");
        return publish(commit(context, repository, record, event, next.state));
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
        return publish(commit(context, repository, record, event, next.state));
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
    subscribe(listener: (value: InterviewServiceSnapshot) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
