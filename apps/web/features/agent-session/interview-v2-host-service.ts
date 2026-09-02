"use client";

import {
  architectureEvidenceFingerprint,
  buildInterviewScaleQuestion,
  createInterviewScaleReview,
  createPresentationCue,
  preflightInterviewV2,
  safeParseInterviewEvaluation,
  safeParseInterviewSimulationCritique,
  validateInterviewScaleEdit,
  validateInterviewScaleReview,
  type AgentContext,
  type InterviewChatAssessment,
  type InterviewEvaluation,
  type InterviewEvaluationResult,
  type InterviewLiveReviewPacket,
  type InterviewQuestion,
  type InterviewService,
  type InterviewServiceSnapshot,
  type InterviewSimulationCritique,
  type InterviewState,
  type InterviewStatus,
  type InterviewV2LiveQuestion,
  type InterviewV2Question,
  type InterviewV2State,
  type PresentationCue,
} from "@faultline/agent-capabilities";
import { getLevelCurriculum } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture, InterviewScenarioCalibration } from "@faultline/core";
import { calibrateInterviewScenarios } from "@faultline/simulator";

import { createDesignInterviewV2Service } from "./interview-v2-service.ts";
import { getBrowserInterviewOwnerKey } from "./interview-storage.ts";

export class DesignInterviewV2HostError extends Error {
  override name = "DesignInterviewV2HostError";
  readonly code: "NO_INTERVIEW" | "STALE_ARCHITECTURE" | "INVALID_INPUT" | "PREPARATION_REQUIRED" | "STORAGE_UNAVAILABLE";
  constructor(message: string, code: DesignInterviewV2HostError["code"]) {
    super(message);
    this.code = code;
  }
}

type PreparedLiveReview = {
  readonly questionId: string;
  readonly reviewDigest: string;
  readonly candidateArchitectureRevision: string;
  readonly liveReview: InterviewLiveReviewPacket;
};

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${value}`;
}

function revision(context: AgentContext): string {
  return context.evidenceMeta?.architectureRevision ?? architectureEvidenceFingerprint(context.architecture);
}

function mapStatus(status: InterviewV2State["status"]): InterviewStatus {
  if (status === "awaiting_chat_answer" || status === "awaiting_chat_evaluation" || status === "refreshing_question" || status === "selecting_question") return "awaiting_answer";
  if (status === "awaiting_canvas_change" || status === "awaiting_scenario_review") return "awaiting_design_change";
  if (status === "awaiting_scenario_critique") return "awaiting_simulation_critique";
  if (status === "completed") return "completed";
  if (status === "abandoned") return "abandoned";
  return "stale";
}

function mapPhase(state: InterviewV2State): InterviewState["phase"] {
  if (state.status === "completed") return "complete";
  const kind = state.currentQuestion?.kind;
  if (kind === "live_scale") return "simulation";
  if (kind === "component_justification" || kind === "live_failure") return "component";
  return "opening";
}

function projectQuestion(question: InterviewV2Question | null): InterviewQuestion | null {
  if (!question) return null;
  if (question.kind === "live_scale") {
    return {
      kind: "simulation",
      questionId: question.questionId as "simulation-traffic-double-v1",
      ordinal: question.ordinal,
      phase: "simulation",
      prompt: question.prompt,
      scenario: { type: "traffic_multiplier", parameters: { multiplier: 1.25 } },
      sourceChallengeId: "interview-live",
      baselineArchitectureRevision: question.evidenceRevision,
      componentIds: [question.targetComponentId],
      grouped: false,
    };
  }
  if (question.kind === "component_justification") {
    return {
      kind: "component",
      questionId: question.questionId,
      ordinal: question.ordinal,
      phase: "component",
      prompt: question.prompt,
      componentIds: [],
      grouped: false,
    };
  }
  if (question.kind === "live_failure") {
    return {
      kind: "discussion",
      questionId: question.questionId,
      ordinal: question.ordinal,
      phase: "opening",
      prompt: question.prompt,
      componentIds: question.targetComponentId ? [question.targetComponentId] : [],
      grouped: false,
    };
  }
  return {
    kind: "discussion",
    questionId: question.questionId,
    ordinal: question.ordinal,
    phase: "opening",
    prompt: question.prompt,
    componentIds: [],
    grouped: false,
  };
}

/** Spotlight the live-scale or chat-failure target using the current architecture revision. */
function liveTargetPresentationCue(context: AgentContext, question: InterviewV2Question | null): PresentationCue | undefined {
  const targetComponentId = question?.kind === "live_scale"
    ? question.targetComponentId
    : question?.kind === "live_failure"
      ? question.targetComponentId
      : undefined;
  if (!question || !targetComponentId) return undefined;
  const evidenceRevision = revision(context);
  return createPresentationCue(
    {
      kind: "spotlight",
      targets: [targetComponentId],
      primaryTarget: targetComponentId,
      reason: question.kind === "live_failure" ? "error-location" : "finding",
      camera: "frame-primary",
    },
    evidenceRevision,
    { component: context.architecture.components.map((component) => component.id) },
  );
}

function projectState(state: InterviewV2State): InterviewState {
  const current = projectQuestion(state.currentQuestion);
  const answers = state.completedSlots.flatMap((slot) => {
    if (!slot.evaluation) return [];
    return [{
      answerId: `slot-${slot.slotId}`,
      questionId: slot.questionId,
      answer: "",
      createdAt: state.startedAt,
      ...slot.evaluation,
    }];
  });
  const lastCritique = [...state.completedSlots].reverse().find((slot) => slot.liveCritique)?.liveCritique;
  let simulationCritique: InterviewSimulationCritique | undefined;
  if (lastCritique) {
    try {
      const parsed = safeParseInterviewSimulationCritique(JSON.parse(lastCritique));
      if (parsed.success) simulationCritique = parsed.data;
    } catch {
      simulationCritique = undefined;
    }
  }
  return {
    interviewId: state.interviewId,
    architectureRevision: state.architectureRevision,
    challengeId: state.challengeId,
    challengeVersion: state.challengeVersion,
    simulatorVersion: state.simulatorVersion,
    questions: state.questions.map((question) => projectQuestion(question)!),
    phase: mapPhase(state),
    status: mapStatus(state.status),
    currentQuestion: current,
    questionOrdinal: Math.min(state.currentQuestionIndex + 1, state.questions.length),
    totalQuestions: state.questions.length,
    answers,
    followUps: state.followUps.map((followUp) => ({
      followUpId: followUp.followUpId,
      questionId: followUp.questionId,
      question: "",
      answer: followUp.answer,
      createdAt: followUp.createdAt,
    })),
    candidateArchitectureRevision: state.architectureRevision,
    ...(state.activeReviewDigest && state.currentQuestion
      ? {
          preparedSimulationReview: {
            questionId: state.currentQuestion.questionId,
            candidateArchitectureRevision: state.architectureRevision,
            reviewDigest: state.activeReviewDigest,
          },
        }
      : {}),
    ...(simulationCritique ? { simulationCritique } : {}),
    startedAt: state.startedAt,
    ...(state.completedAt ? { completedAt: state.completedAt } : {}),
  };
}

function assessmentFor(question: InterviewV2Question | null): InterviewChatAssessment | undefined {
  if (question?.kind === "request_path" || question?.kind === "component_justification" || question?.kind === "challenge_edge_case" || question?.kind === "live_failure") {
    return question.assessment;
  }
  return undefined;
}

function asEvaluationResult(evaluation: InterviewEvaluation): InterviewEvaluationResult {
  const grounding = "grounding" in evaluation && typeof (evaluation as { grounding?: unknown }).grounding === "string"
    ? (evaluation as InterviewEvaluationResult).grounding
    : "architecture_evidence";
  const parsed = safeParseInterviewEvaluation({ ...evaluation, grounding });
  if (!parsed.success) throw new DesignInterviewV2HostError(parsed.errors.join(" "), "INVALID_INPUT");
  return parsed.data;
}

/** Browser InterviewService adapter over the five-slot v2 reducer and Q1–Q5 builders. */
export function createDesignInterviewV2HostService(ownerKey = typeof window === "undefined" ? "ssr-placeholder" : getBrowserInterviewOwnerKey()): InterviewService {
  const store = createDesignInterviewV2Service(ownerKey);
  const listeners = new Set<(snapshot: InterviewServiceSnapshot) => void>();
  const prepared = new Map<string, PreparedLiveReview>();
  let calibrationCache: InterviewScenarioCalibration | undefined;
  let baselineCache: Architecture | undefined;

  function publish(snapshot: InterviewServiceSnapshot): InterviewServiceSnapshot {
    listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  }

  function toSnapshot(context: AgentContext): InterviewServiceSnapshot {
    const record = store.get();
    if (!record) throw new DesignInterviewV2HostError("No active design interview.", "NO_INTERVIEW");
    const state = projectState(record.state);
    const preparedReview = prepared.get(record.state.interviewId);
    const activeFailure = record.state.status !== "completed"
      && record.state.status !== "abandoned"
      && record.state.status !== "stale"
      && record.state.currentQuestion?.kind === "live_failure";
    const presentationCue = activeFailure ? liveTargetPresentationCue(context, record.state.currentQuestion) : undefined;
    return {
      state,
      question: state.currentQuestion,
      ...(assessmentFor(record.state.currentQuestion) ? { assessment: assessmentFor(record.state.currentQuestion) } : {}),
      storageRevision: record.revision,
      ...(presentationCue ? { presentationCue } : {}),
      ...(preparedReview ? { liveReview: preparedReview.liveReview } : {}),
    };
  }

  function curriculumFor(context: AgentContext) {
    let level;
    try {
      level = getLevelCurriculum(context.challenge.slug);
    } catch {
      throw new DesignInterviewV2HostError(
        "This challenge has no authored interview curriculum. Choose a challenge with interview cards, then retry.",
        "PREPARATION_REQUIRED",
      );
    }
    const componentCards = Object.fromEntries(
      Object.entries(level.componentCards).map(([type, card]) => [type, { type: card.type, placementIntent: card.placementIntent }]),
    );
    return {
      starterComponentIds: level.interviewCurriculum.starterComponentIds,
      componentCards,
      curriculum: {
        edgeCaseCards: level.interviewCurriculum.edgeCaseCards,
        settingFacts: level.interviewCurriculum.settingFacts,
      },
    };
  }

  function calibrate(context: AgentContext): InterviewScenarioCalibration {
    const next = calibrateInterviewScenarios({
      architecture: context.architecture,
      challenge: context.challenge,
      architectureRevision: revision(context),
      simulatorVersion: context.evidenceMeta?.simulatorVersion ?? "unknown",
    }, componentRegistry);
    calibrationCache = next;
    return next;
  }

  function startFromContext(context: AgentContext, restarting: boolean): InterviewServiceSnapshot {
    const calibration = calibrate(context);
    const materials = curriculumFor(context);
    const preflight = preflightInterviewV2({
      context,
      starterComponentIds: materials.starterComponentIds,
      componentCards: materials.componentCards,
      curriculum: materials.curriculum,
      calibration,
    });
    if (!preflight.ok) throw new DesignInterviewV2HostError(`${preflight.message} ${preflight.preparationAction}`, "PREPARATION_REQUIRED");
    const event = {
      type: "start" as const,
      interviewId: id("interview"),
      architectureRevision: revision(context),
      challengeId: context.challenge.slug,
      challengeVersion: context.challenge.version,
      simulatorVersion: context.evidenceMeta?.simulatorVersion ?? "unknown",
      questions: preflight.questions,
      startedAt: now(),
    };
    baselineCache = structuredClone(context.architecture);
    prepared.clear();
    if (restarting) store.restart(event, context.architecture);
    else store.start(event, context.architecture);
    return publish(toSnapshot(context));
  }

  function ensureActive(context: AgentContext) {
    const record = store.get();
    if (!record) throw new DesignInterviewV2HostError("No active design interview.", "NO_INTERVIEW");
    if (record.state.challengeId !== context.challenge.slug || record.state.challengeVersion !== context.challenge.version) {
      store.dispatch({ type: "stale" });
      throw new DesignInterviewV2HostError("The challenge changed since this interview started. Restart the interview.", "STALE_ARCHITECTURE");
    }
    return record;
  }

  function liveQuestion(state: InterviewV2State): InterviewV2LiveQuestion | undefined {
    const question = state.currentQuestion;
    if (!question || question.kind !== "live_scale") return undefined;
    return question;
  }

  return {
    start(context) {
      const existing = store.get();
      if (existing && existing.state.status !== "abandoned" && existing.state.status !== "stale") return publish(toSnapshot(context));
      return startFromContext(context, false);
    },
    restart(context) {
      return startFromContext(context, true);
    },
    get(context) {
      return toSnapshot(context);
    },
    clear() {
      prepared.clear();
      store.clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    syncArchitecture(context) {
      const record = ensureActive(context);
      const nextRevision = revision(context);
      if (nextRevision === record.state.architectureRevision) return toSnapshot(context);
      const committed = store.dispatch({ type: "semantic_edit", architectureRevision: nextRevision });
      prepared.delete(committed.state.interviewId);
      return publish(toSnapshot(context));
    },
    submitAnswer(context, input) {
      ensureActive(context);
      store.dispatch({
        type: "answer",
        questionId: input.questionId,
        answer: input.answer,
        evaluation: asEvaluationResult(input.evaluation),
      });
      return publish(toSnapshot(context));
    },
    followUp(context, input) {
      ensureActive(context);
      store.dispatch({
        type: "follow_up",
        questionId: input.questionId,
        followUpId: input.followUpId ?? id("follow-up"),
        answer: input.answer,
        createdAt: now(),
      });
      return publish(toSnapshot(context));
    },
    advance() {
      throw new DesignInterviewV2HostError("advance_design_interview is retired from the five-slot interview. Chat slots advance when you submit an evaluation.", "INVALID_INPUT");
    },
    end(context) {
      const record = ensureActive(context);
      store.dispatch({ type: "abandon" });
      prepared.delete(record.state.interviewId);
      return publish(toSnapshot(context));
    },
    prepareSimulationReview(context, input) {
      const record = ensureActive(context);
      if (record.state.interviewId !== input.interviewId) throw new DesignInterviewV2HostError("Interview ID does not match.", "INVALID_INPUT");
      const question = liveQuestion(record.state);
      if (!question || question.questionId !== input.questionId) throw new DesignInterviewV2HostError("Live scenario review is only available for the current live scale slot.", "INVALID_INPUT");
      let architectureRevision = revision(context);
      if (architectureRevision !== record.state.architectureRevision) {
        store.dispatch({ type: "semantic_edit", architectureRevision });
        architectureRevision = revision(context);
      }
      const active = store.get();
      if (!active) throw new DesignInterviewV2HostError("No active design interview.", "NO_INTERVIEW");
      const calibration = calibrationCache && calibrationCache.architectureRevision === architectureRevision ? calibrationCache : calibrate(context);
      const baseline = baselineCache ?? active.baselineArchitecture;

      const scaleQuestion = buildInterviewScaleQuestion(calibration, question.evidenceRevision, question.calibrationId);
      const edit = validateInterviewScaleEdit(baseline, context.architecture, scaleQuestion);
      if (!edit.ok) {
        store.dispatch({ type: "scenario_review", questionId: question.questionId, architectureRevision, passed: false, critique: edit.message });
        throw new DesignInterviewV2HostError(edit.message, "INVALID_INPUT");
      }
      const before = Number(baseline.components.find((component) => component.id === scaleQuestion.targetComponentId)?.config[scaleQuestion.targetConfigPath]);
      const after = Number(context.architecture.components.find((component) => component.id === scaleQuestion.targetComponentId)?.config[scaleQuestion.targetConfigPath]);
      const review = createInterviewScaleReview({
        questionId: scaleQuestion.questionId,
        candidateId: scaleQuestion.candidateId,
        evidenceRevision: scaleQuestion.evidenceRevision,
        candidateArchitectureRevision: architectureRevision,
        simulatorRunId: context.evidenceMeta?.simulationRunId ?? "interview-live",
        targetComponentId: scaleQuestion.targetComponentId,
        targetCapacityDelta: Number.isFinite(after - before) ? Math.max(after - before, 1) : 1,
        passed: true,
      });
      const validated = validateInterviewScaleReview(review, scaleQuestion, architectureRevision);
      if (!validated.ok) throw new DesignInterviewV2HostError(validated.message, "INVALID_INPUT");
      store.dispatch({ type: "scenario_review", questionId: question.questionId, architectureRevision, passed: true, reviewDigest: review.reviewDigest });
      prepared.set(active.state.interviewId, {
        questionId: question.questionId,
        reviewDigest: review.reviewDigest,
        candidateArchitectureRevision: architectureRevision,
        liveReview: { kind: "scale", review },
      });
      return publish(toSnapshot(context));
    },
    submitSimulationCritique(context, input) {
      const record = ensureActive(context);
      if (record.state.interviewId !== input.interviewId) throw new DesignInterviewV2HostError("Interview ID does not match.", "INVALID_INPUT");
      const critique = safeParseInterviewSimulationCritique(input.critique);
      if (!critique.success) throw new DesignInterviewV2HostError(critique.errors.join(" "), "INVALID_INPUT");
      const preparedReview = prepared.get(record.state.interviewId);
      if (!preparedReview || preparedReview.reviewDigest !== input.reviewDigest || preparedReview.candidateArchitectureRevision !== input.candidateArchitectureRevision) {
        throw new DesignInterviewV2HostError("The simulation review digest is stale. Prepare a fresh review.", "INVALID_INPUT");
      }
      store.dispatch({
        type: "scenario_critique",
        questionId: input.questionId,
        architectureRevision: input.candidateArchitectureRevision,
        reviewDigest: input.reviewDigest,
        critique: JSON.stringify(critique.data),
      });
      prepared.delete(record.state.interviewId);
      const next = store.get();
      if (next?.state.status === "completed" || next?.state.currentQuestion?.kind === "challenge_edge_case" || next?.state.currentQuestion?.kind === "live_failure") {
        baselineCache = structuredClone(context.architecture);
      }
      return publish(toSnapshot(context));
    },
  };
}
