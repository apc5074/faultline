import { isValidRegion, type Architecture, type RegionId } from "@faultline/core";

import type { CapabilityExecutionOptions } from "./capability.js";
import type { AgentContext } from "./context.js";
import { capabilityError, capabilityOk, type CapabilityResult } from "./result.js";
import {
  AGENT_ANNOTATION_MAX_COUNT,
  createEmptyAgentSessionState,
  validateAnnotationAgainstArchitecture,
  type AgentFocusAnnotation,
  type AgentNoteAnnotation,
  type AgentPathAnnotation,
  type AgentSessionState,
  type AnnotationValidationResult,
} from "./session.js";
import type {
  AnnotateComponentInput,
  ClearAnnotationsInput,
  FocusComponentInput,
  FocusRegionInput,
  HighlightConnectionInput,
} from "./visual-schemas.js";

export interface VisualAnnotationIntent {
  readonly annotation: AgentFocusAnnotation | AgentNoteAnnotation | AgentPathAnnotation;
}

export interface ClearAnnotationsIntent {
  readonly clearedCount: number;
}

/** Canonical world-map target; carries no derived routing or health state. */
export interface FocusRegionIntent {
  readonly regionId: RegionId;
}

function sessionFromOptions(options?: CapabilityExecutionOptions): AgentSessionState {
  return options?.session ?? createEmptyAgentSessionState();
}

function createVisualAnnotationId(
  kind: string,
  anchorId: string,
  session: AgentSessionState,
): string {
  return `${kind}-${anchorId}-${session.revision}-${session.annotations.length}`;
}

function visualMetadata(context: AgentContext, session: AgentSessionState, intentId: string) {
  return {
    source: "external-agent" as const,
    architectureRevision: context.evidenceMeta?.architectureRevision ?? "unversioned",
    focusRevision: session.revision,
    createdAt: new Date().toISOString(),
    intentId,
  };
}

function validationFailure(result: AnnotationValidationResult): CapabilityResult<never> {
  if (result.ok) {
    throw new Error("Expected annotation validation to fail.");
  }
  return capabilityError(result.code, result.message);
}

function hasComponentId(architecture: Architecture, componentId: string): boolean {
  return architecture.components.some((component) => component.id === componentId);
}

function hasConnectionId(architecture: Architecture, connectionId: string): boolean {
  return architecture.connections.some((connection) => connection.id === connectionId);
}

export function focusComponent(
  context: AgentContext,
  input: FocusComponentInput,
  options?: CapabilityExecutionOptions,
): CapabilityResult<VisualAnnotationIntent> {
  const session = sessionFromOptions(options);
  const annotation: AgentFocusAnnotation = {
    id: createVisualAnnotationId("focus", input.componentId, session),
    type: "focus",
    componentId: input.componentId,
    ...visualMetadata(context, session, createVisualAnnotationId("focus", input.componentId, session)),
  };
  const validated = validateAnnotationAgainstArchitecture(annotation, context.architecture);
  if (!validated.ok) return validationFailure(validated);
  return capabilityOk({ annotation });
}

export function focusRegion(
  context: AgentContext,
  input: FocusRegionInput,
): CapabilityResult<FocusRegionIntent> {
  const activeRegions = context.challenge.geographicDistribution;
  if (!activeRegions || activeRegions.length === 0) {
    return capabilityError("INVALID_INPUT", "focus_region is unavailable because challenge geography is inactive.");
  }
  if (!isValidRegion(input.regionId)) {
    return capabilityError("NOT_FOUND", `Unknown region "${input.regionId}".`);
  }
  if (!activeRegions.some((entry) => entry.regionId === input.regionId)) {
    return capabilityError("NOT_FOUND", `Region "${input.regionId}" is not active for this challenge.`);
  }
  return capabilityOk({ regionId: input.regionId });
}

export function annotateComponent(
  context: AgentContext,
  input: AnnotateComponentInput,
  options?: CapabilityExecutionOptions,
): CapabilityResult<VisualAnnotationIntent> {
  const session = sessionFromOptions(options);
  const annotation: AgentNoteAnnotation = {
    id: createVisualAnnotationId("note", input.componentId, session),
    type: "note",
    componentId: input.componentId,
    text: input.text.trim(),
    ...(input.tone ? { tone: input.tone } : {}),
    ...visualMetadata(context, session, createVisualAnnotationId("note", input.componentId, session)),
  };
  const validated = validateAnnotationAgainstArchitecture(annotation, context.architecture);
  if (!validated.ok) return validationFailure(validated);
  return capabilityOk({ annotation });
}

export function highlightConnection(
  context: AgentContext,
  input: HighlightConnectionInput,
  options?: CapabilityExecutionOptions,
): CapabilityResult<VisualAnnotationIntent> {
  const session = sessionFromOptions(options);
  const annotation: AgentPathAnnotation = {
    id: createVisualAnnotationId("path", input.connectionId, session),
    type: "path",
    connectionId: input.connectionId,
    ...(input.label !== undefined ? { label: input.label.trim() } : {}),
    ...visualMetadata(context, session, createVisualAnnotationId("path", input.connectionId, session)),
  };
  const validated = validateAnnotationAgainstArchitecture(annotation, context.architecture);
  if (!validated.ok) return validationFailure(validated);
  return capabilityOk({ annotation });
}

export function countAnnotationsToClear(
  session: AgentSessionState,
  input: ClearAnnotationsInput,
): number {
  const scope = input.scope ?? "all";
  if (scope === "all") return session.annotations.length;
  if (input.componentId === undefined) return 0;
  return session.annotations.filter((annotation) => {
    if (annotation.type === "focus" || annotation.type === "note") {
      return annotation.componentId === input.componentId;
    }
    return false;
  }).length;
}

export function clearAnnotations(
  context: AgentContext,
  input: ClearAnnotationsInput,
  options?: CapabilityExecutionOptions,
): CapabilityResult<ClearAnnotationsIntent> {
  const scope = input.scope ?? "all";
  if (scope === "component") {
    if (input.componentId === undefined) {
      return capabilityError("INVALID_INPUT", "componentId is required when scope is component.");
    }
    if (!hasComponentId(context.architecture, input.componentId)) {
      return capabilityError("NOT_FOUND", `Unknown component "${input.componentId}".`);
    }
  }

  const session = sessionFromOptions(options);
  return capabilityOk({ clearedCount: countAnnotationsToClear(session, input) });
}

/** Append validated annotation intents to session state (client bridge helper). */
export function appendValidatedAnnotations(
  state: AgentSessionState,
  architecture: Architecture,
  incoming: readonly (AgentFocusAnnotation | AgentNoteAnnotation | AgentPathAnnotation)[],
): AgentSessionState {
  const accepted = incoming.filter(
    (annotation) => validateAnnotationAgainstArchitecture(annotation, architecture).ok,
  );
  if (accepted.length === 0) return state;
  const annotationKey = (annotation: AgentFocusAnnotation | AgentNoteAnnotation | AgentPathAnnotation) => {
    switch (annotation.type) {
      case "focus": return `focus:${annotation.componentId}`;
      case "note": return `note:${annotation.componentId}:${annotation.text}:${annotation.tone ?? "neutral"}`;
      case "path": return `path:${annotation.connectionId}:${annotation.label ?? ""}`;
    }
  };
  const existingKeys = new Set(
    state.annotations
      .filter((annotation): annotation is AgentFocusAnnotation | AgentNoteAnnotation | AgentPathAnnotation => annotation.type !== "stamp")
      .map(annotationKey),
  );
  const distinct = accepted.filter((annotation) => {
    const key = annotationKey(annotation);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  if (distinct.length === 0) return state;
  const merged = [...state.annotations, ...distinct].slice(-AGENT_ANNOTATION_MAX_COUNT);
  return {
    ...state,
    annotations: merged,
    revision: state.revision + 1,
  };
}
