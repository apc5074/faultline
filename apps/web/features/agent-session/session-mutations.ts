import type {
  AgentAnnotation,
  AgentPendingHelpRequest,
  AgentSessionFocus,
  AgentSessionState,
} from "@faultline/agent-capabilities";
import {
  AGENT_ANNOTATION_MAX_COUNT,
  pruneAnnotationsAgainstArchitecture,
  prunePendingHelpRequestAgainstArchitecture,
  pruneSessionFocusAgainstArchitecture,
  validateAnnotationAgainstArchitecture,
} from "@faultline/agent-capabilities";
import type { Architecture } from "@faultline/core";

function nextRevision(state: AgentSessionState): number {
  return state.revision + 1;
}

function hasComponentId(architecture: Architecture, componentId: string): boolean {
  return architecture.components.some((component) => component.id === componentId);
}

function hasConnectionId(architecture: Architecture, connectionId: string): boolean {
  return architecture.connections.some((connection) => connection.id === connectionId);
}

function validateFocusAgainstArchitecture(
  focus: AgentSessionFocus,
  architecture: Architecture,
): boolean {
  if (focus.kind === "component") return hasComponentId(architecture, focus.componentId);
  if (focus.kind === "connection") return hasConnectionId(architecture, focus.connectionId);
  return true;
}

/** Drop stale session fields when the architecture fingerprint changes. */
export function pruneSessionForArchitecture(
  state: AgentSessionState,
  architecture: Architecture,
): AgentSessionState {
  return {
    ...state,
    focus: pruneSessionFocusAgainstArchitecture(state.focus, architecture),
    pendingHelpRequest: prunePendingHelpRequestAgainstArchitecture(
      state.pendingHelpRequest,
      architecture,
    ),
    annotations: pruneAnnotationsAgainstArchitecture(state.annotations, architecture),
  };
}

export function withSessionFocus(
  state: AgentSessionState,
  focus: AgentSessionFocus,
  architecture: Architecture,
): AgentSessionState {
  if (!validateFocusAgainstArchitecture(focus, architecture)) {
    return state;
  }
  return {
    ...state,
    focus,
    revision: nextRevision(state),
  };
}

export function withPendingHelpRequest(
  state: AgentSessionState,
  pendingHelpRequest: AgentPendingHelpRequest | null,
  architecture: Architecture,
): AgentSessionState {
  const nextPending =
    pendingHelpRequest === null
      ? null
      : prunePendingHelpRequestAgainstArchitecture(pendingHelpRequest, architecture);
  return {
    ...state,
    pendingHelpRequest: nextPending,
    revision: nextRevision(state),
  };
}

export function applySessionAnnotations(
  state: AgentSessionState,
  architecture: Architecture,
  incoming: readonly AgentAnnotation[],
): AgentSessionState {
  const accepted = incoming.filter(
    (annotation) => validateAnnotationAgainstArchitecture(annotation, architecture).ok,
  );
  if (accepted.length === 0) return state;

  // Focus is an ephemeral explanation marker. A new one replaces prior focus
  // brackets but deliberately leaves player-visible notes and path marks.
  const retained = accepted.some((annotation) => annotation.type === "focus")
    ? state.annotations.filter((annotation) => annotation.type !== "focus")
    : state.annotations;
  const merged = [...retained, ...accepted].slice(-AGENT_ANNOTATION_MAX_COUNT);
  return {
    ...state,
    annotations: merged,
    revision: nextRevision(state),
  };
}

export function clearSessionAnnotations(
  state: AgentSessionState,
  scope: "all" | "component" = "all",
  componentId?: string,
): AgentSessionState {
  if (scope === "all") {
    if (state.annotations.length === 0) return state;
    return {
      ...state,
      annotations: [],
      revision: nextRevision(state),
    };
  }

  if (componentId === undefined) return state;

  const nextAnnotations = state.annotations.filter((annotation) => {
    if (annotation.type === "focus" || annotation.type === "note") {
      return annotation.componentId !== componentId;
    }
    return true;
  });

  if (nextAnnotations.length === state.annotations.length) return state;

  return {
    ...state,
    annotations: nextAnnotations,
    revision: nextRevision(state),
  };
}

/**
 * Run behavior (W-11): keep coaching notes/paths/stamps; drop ephemeral focus ticks only.
 * Notes survive so the player can still read findings against fresh simulator evidence.
 */
export function clearFocusAnnotationsOnRun(state: AgentSessionState): AgentSessionState {
  const nextAnnotations = state.annotations.filter((annotation) => annotation.type !== "focus");
  if (nextAnnotations.length === state.annotations.length) return state;
  return {
    ...state,
    annotations: nextAnnotations,
    revision: nextRevision(state),
  };
}

/** True when prune removed focus, help, or annotation targets. */
export function sessionChangedByPrune(
  before: AgentSessionState,
  after: AgentSessionState,
): boolean {
  return (
    before.focus !== after.focus ||
    before.pendingHelpRequest !== after.pendingHelpRequest ||
    before.annotations.length !== after.annotations.length ||
    before.annotations.some((annotation, index) => annotation.id !== after.annotations[index]?.id)
  );
}
