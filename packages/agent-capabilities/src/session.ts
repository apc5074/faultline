import type { Architecture } from "@faultline/core";

import type { AgentContext } from "./context.js";
import type { CapabilityErrorCode } from "./result.js";

/** Maximum coaching annotations visible on the canvas at once. */
export const AGENT_ANNOTATION_MAX_COUNT = 12;

/** Maximum characters for note annotation marginal text. */
export const AGENT_NOTE_MAX_TEXT_LENGTH = 280;
export const AGENT_PATH_LABEL_MAX_TEXT_LENGTH = 120;
export const AGENT_VISUAL_EVIDENCE_REF_MAX_COUNT = 4;

export type AgentVisualSource = "external-agent" | "embedded-ai";

export interface AgentVisualMetadata {
  readonly source?: AgentVisualSource;
  readonly architectureRevision?: string;
  readonly focusRevision?: number;
  readonly createdAt?: string;
  readonly evidenceRefs?: readonly string[];
  readonly intentId?: string;
}

export type AgentSessionFocusSource = "selection" | "help" | "agent";

export type AgentSessionFocus =
  | { readonly kind: "none" }
  | {
      readonly kind: "component";
      readonly componentId: string;
      readonly source: AgentSessionFocusSource;
    }
  | {
      readonly kind: "connection";
      readonly connectionId: string;
      readonly source: AgentSessionFocusSource;
    }
  | { readonly kind: "region"; readonly regionId: string; readonly source: AgentSessionFocusSource }
  | { readonly kind: "requirement"; readonly requirementId: string; readonly source: AgentSessionFocusSource }
  | { readonly kind: "workload_channel"; readonly workloadChannelId: string; readonly source: AgentSessionFocusSource };

/** The user-selected investigation shape; never an instruction to edit architecture. */
export type PromptIntent = "component_review" | "workload_trace" | "requirement_failure" | "cost_review";

export interface AgentPendingHelpRequest {
  readonly id: string;
  readonly template: string;
  readonly promptIntent?: PromptIntent;
  /** Session revision of the human focus used to create this invitation. */
  readonly focusRevision?: number;
  readonly suggestedCapabilityNames?: readonly string[];
  readonly componentId?: string;
  readonly connectionId?: string;
  readonly regionId?: string;
  readonly requirementId?: string;
  readonly workloadChannelId?: string;
}

export type AgentAnnotationTone = "neutral" | "question" | "risk";

export interface AgentFocusAnnotation extends AgentVisualMetadata {
  readonly id: string;
  readonly type: "focus";
  readonly componentId: string;
}

export interface AgentNoteAnnotation extends AgentVisualMetadata {
  readonly id: string;
  readonly type: "note";
  readonly componentId: string;
  readonly text: string;
  readonly tone?: AgentAnnotationTone;
}

export interface AgentPathAnnotation extends AgentVisualMetadata {
  readonly id: string;
  readonly type: "path";
  readonly connectionId: string;
  readonly label?: string;
}

export interface AgentStampAnnotation {
  readonly id: string;
  readonly type: "stamp";
  readonly text: string;
  readonly toolName?: string;
}

export type AgentAnnotation =
  | AgentFocusAnnotation
  | AgentNoteAnnotation
  | AgentPathAnnotation
  | AgentStampAnnotation;

export interface AgentSessionState {
  readonly focus: AgentSessionFocus;
  readonly pendingHelpRequest: AgentPendingHelpRequest | null;
  readonly annotations: readonly AgentAnnotation[];
  readonly revision: number;
}

/** Immutable domain + session snapshot for one agent tool invocation. */
export interface LiveAgentSnapshot {
  readonly context: AgentContext;
  readonly session: AgentSessionState;
}

export type AnnotationValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: CapabilityErrorCode; readonly message: string };

const annotationToneSet = new Set<string>(["neutral", "question", "risk"]);

function validationError(
  code: CapabilityErrorCode,
  message: string,
): AnnotationValidationResult {
  return { ok: false, code, message };
}

function hasComponentId(architecture: Architecture, componentId: string): boolean {
  return architecture.components.some((component) => component.id === componentId);
}

function hasConnectionId(architecture: Architecture, connectionId: string): boolean {
  return architecture.connections.some((connection) => connection.id === connectionId);
}

/** Empty session before human selection, help chips, or agent visual intents. */
export function createEmptyAgentSessionState(): AgentSessionState {
  return {
    focus: { kind: "none" },
    pendingHelpRequest: null,
    annotations: [],
    revision: 0,
  };
}

/**
 * Validate one annotation against the current architecture snapshot.
 * Rejects unknown component or connection IDs and invalid note payloads.
 */
export function validateAnnotationAgainstArchitecture(
  annotation: AgentAnnotation,
  architecture: Architecture,
): AnnotationValidationResult {
  switch (annotation.type) {
    case "focus":
      if (!hasComponentId(architecture, annotation.componentId)) {
        return validationError("NOT_FOUND", `Unknown component "${annotation.componentId}".`);
      }
      return { ok: true };
    case "note": {
      if (!hasComponentId(architecture, annotation.componentId)) {
        return validationError("NOT_FOUND", `Unknown component "${annotation.componentId}".`);
      }
      const text = annotation.text.trim();
      if (text.length === 0) {
        return validationError("INVALID_INPUT", "Note text must not be empty.");
      }
      if (text.length > AGENT_NOTE_MAX_TEXT_LENGTH) {
        return validationError(
          "INVALID_INPUT",
          `Note text must be at most ${AGENT_NOTE_MAX_TEXT_LENGTH} characters.`,
        );
      }
      if (annotation.tone !== undefined && !annotationToneSet.has(annotation.tone)) {
        return validationError("INVALID_INPUT", `Unknown note tone "${annotation.tone}".`);
      }
      return { ok: true };
    }
    case "path":
      if (!hasConnectionId(architecture, annotation.connectionId)) {
        return validationError("NOT_FOUND", `Unknown connection "${annotation.connectionId}".`);
      }
      if (annotation.label !== undefined && annotation.label.trim().length > AGENT_PATH_LABEL_MAX_TEXT_LENGTH) {
        return validationError("INVALID_INPUT", `Path label must be at most ${AGENT_PATH_LABEL_MAX_TEXT_LENGTH} characters.`);
      }
      return { ok: true };
    case "stamp": {
      const text = annotation.text.trim();
      if (text.length === 0) {
        return validationError("INVALID_INPUT", "Stamp text must not be empty.");
      }
      return { ok: true };
    }
  }
}

/** Drop annotations whose component or connection IDs no longer exist. */
export function pruneAnnotationsAgainstArchitecture(
  annotations: readonly AgentAnnotation[],
  architecture: Architecture,
): AgentAnnotation[] {
  return annotations.filter(
    (annotation) => validateAnnotationAgainstArchitecture(annotation, architecture).ok,
  );
}

/** Drop stale focus targets when architecture changes. */
export function pruneSessionFocusAgainstArchitecture(
  focus: AgentSessionFocus,
  architecture: Architecture,
): AgentSessionFocus {
  if (focus.kind === "component" && !hasComponentId(architecture, focus.componentId)) {
    return { kind: "none" };
  }
  if (focus.kind === "connection" && !hasConnectionId(architecture, focus.connectionId)) {
    return { kind: "none" };
  }
  return focus;
}

/** Drop stale help-request IDs when architecture changes. */
export function prunePendingHelpRequestAgainstArchitecture(
  pendingHelpRequest: AgentPendingHelpRequest | null,
  architecture: Architecture,
): AgentPendingHelpRequest | null {
  if (!pendingHelpRequest) return null;

  if (
    pendingHelpRequest.componentId !== undefined &&
    !hasComponentId(architecture, pendingHelpRequest.componentId)
  ) {
    return null;
  }
  if (
    pendingHelpRequest.connectionId !== undefined &&
    !hasConnectionId(architecture, pendingHelpRequest.connectionId)
  ) {
    return null;
  }
  if (
    pendingHelpRequest.connectionId !== undefined &&
    !hasConnectionId(architecture, pendingHelpRequest.connectionId)
  ) {
    return null;
  }
  return pendingHelpRequest;
}
