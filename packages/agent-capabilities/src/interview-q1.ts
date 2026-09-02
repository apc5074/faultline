import type { AgentContext, AgentWorkloadPathEvidence } from "./context.js";
import { createPresentationCue, type PresentationCue } from "./presentation-cue.js";

export type RequestPathRubricStatus = "valid" | "partial" | "broken" | "unavailable";

export interface RequestPathEvidence {
  readonly available: boolean;
  readonly evidenceRevision: string;
  readonly channelId?: string;
  readonly pathId?: string;
  readonly status?: "complete" | "partial" | "failed";
  readonly componentIds: readonly string[];
  readonly connectionIds: readonly string[];
  readonly failureCode?: string;
  readonly failureReason?: string;
  readonly terminalRuleId?: string;
  readonly unavailableReason?: "no_simulation" | "no_current_path";
}

export interface RequestPathRubric {
  readonly status: RequestPathRubricStatus;
  readonly requiredTopics: readonly string[];
  readonly evidenceBasis: "current_path" | "current_path_failure" | "unavailable";
}

export interface RequestPathQuestion {
  readonly slotId: "request-path-v2";
  readonly questionId: "request-path-v2";
  readonly prompt: string;
  readonly evidenceRevision: string;
  readonly evidence: RequestPathEvidence;
  readonly rubric: RequestPathRubric;
  readonly presentationCue?: PresentationCue;
}

export interface RequestPathAnswerPacket {
  readonly questionId: "request-path-v2";
  readonly evidenceRevision: string;
  readonly answer: string;
  readonly evaluation: unknown;
}

function revisionFor(context: AgentContext): string {
  return context.evidenceMeta?.architectureRevision ?? "unversioned";
}

function pathCandidates(context: AgentContext): Array<{ channelId: string; path: AgentWorkloadPathEvidence }> {
  if (context.simulation?.available !== true) return [];
  return Object.entries(context.simulation.workloadPaths ?? {})
    .flatMap(([channelId, channel]) => channel.paths.map((path) => ({ channelId, path })))
    .sort((left, right) => left.channelId.localeCompare(right.channelId) || left.path.pathId.localeCompare(right.path.pathId));
}

function rubricFor(status: RequestPathEvidence["status"]): RequestPathRubric {
  if (status === "complete") return { status: "valid", requiredTopics: ["request path", "component responsibilities", "one tradeoff"], evidenceBasis: "current_path" };
  if (status === "partial") return { status: "partial", requiredTopics: ["request path", "missing or weak boundary", "one tradeoff"], evidenceBasis: "current_path" };
  return { status: "broken", requiredTopics: ["request path", "observed failure boundary", "one recovery tradeoff"], evidenceBasis: "current_path_failure" };
}

function cueFor(context: AgentContext, evidence: RequestPathEvidence): PresentationCue | undefined {
  if (!evidence.available) return undefined;
  const revision = evidence.evidenceRevision;
  return createPresentationCue(
    { kind: "path", targets: [...evidence.componentIds, ...evidence.connectionIds], primaryTarget: evidence.componentIds[0], reason: "causal-path", camera: "frame-path" },
    revision,
    { component: context.architecture.components.map((component) => component.id), connection: context.architecture.connections.map((connection) => connection.id) },
  );
}

/** Build the current deterministic workload path packet for Q1. */
export function buildRequestPathEvidence(context: AgentContext): RequestPathEvidence {
  const evidenceRevision = revisionFor(context);
  if (context.simulation?.available !== true) return { available: false, evidenceRevision, componentIds: [], connectionIds: [], unavailableReason: "no_simulation" };
  const selected = pathCandidates(context)[0];
  if (!selected) return { available: false, evidenceRevision, componentIds: [], connectionIds: [], unavailableReason: "no_current_path" };
  return {
    available: true,
    evidenceRevision,
    channelId: selected.channelId,
    pathId: selected.path.pathId,
    status: selected.path.status,
    componentIds: selected.path.componentIds,
    connectionIds: selected.path.connectionIds,
    ...(selected.path.failureCode ? { failureCode: selected.path.failureCode } : {}),
    ...(selected.path.failureReason ? { failureReason: selected.path.failureReason } : {}),
    ...(selected.path.terminalRuleId ? { terminalRuleId: selected.path.terminalRuleId } : {}),
  };
}

export function buildRequestPathQuestion(context: AgentContext): RequestPathQuestion {
  const evidence = buildRequestPathEvidence(context);
  const rubric = evidence.available
    ? rubricFor(evidence.status)
    : { status: "unavailable" as const, requiredTopics: ["say what evidence is missing", "trace the visible connected path", "one bounded assumption"], evidenceBasis: "unavailable" as const };
  return {
    slotId: "request-path-v2",
    questionId: "request-path-v2",
    prompt: "Trace one representative request through the current connected path. Explain each boundary and one tradeoff Faultline should investigate.",
    evidenceRevision: evidence.evidenceRevision,
    evidence,
    rubric,
    ...(cueFor(context, evidence) ? { presentationCue: cueFor(context, evidence) } : {}),
  };
}

/** A Q1 answer/evaluation may only be applied to the revision it observed. */
export function validateRequestPathAnswer(packet: RequestPathAnswerPacket, question: RequestPathQuestion): { readonly ok: true } | { readonly ok: false; readonly code: "STALE_EVIDENCE" | "INVALID_INPUT"; readonly message: string } {
  if (packet.questionId !== question.questionId || packet.evidenceRevision !== question.evidenceRevision) return { ok: false, code: "STALE_EVIDENCE", message: "The request-path question changed; refresh the current question before evaluating this answer." };
  if (typeof packet.answer !== "string" || packet.answer.trim().length === 0 || packet.answer.length > 20_000) return { ok: false, code: "INVALID_INPUT", message: "Answer must be between 1 and 20000 characters." };
  if (packet.evaluation === undefined) return { ok: false, code: "INVALID_INPUT", message: "A schema-valid evaluation is required before advancing." };
  return { ok: true };
}
