import type { AgentFocusAnnotation, PinnedObservation } from "@faultline/agent-capabilities";
import type { RegionId } from "@faultline/core";
import type { VisualIntent, VisualIntentHandler } from "@faultline/webmcp";

import type { AgentSessionStore } from "./AgentSessionProvider";

export interface VisualCommandPublisherOptions {
  /**
   * Keeps a valid focus command legible in the host presentation without
   * giving the command access to architecture or simulation state.
   */
  readonly onFocusComponent?: (componentId: string) => void;
  readonly onFocusConnection?: (connectionId: string) => void;
  readonly onFocusRegion?: (regionId: RegionId) => void;
  readonly onPinObservation?: (observation: PinnedObservation) => void;
  /** Synchronous barrier ack once a focus annotation is committed to session state. */
  readonly onFocusAnnotationCommitted?: (annotation: AgentFocusAnnotation, sessionRevision: number) => void;
}

/**
 * The single client-side visual-command publisher. Adapters produce validated
 * intents; this publisher is the only place that applies coaching state.
 * Playback/observation commands can be added here without giving an adapter
 * its own annotation store.
 */
export function createVisualCommandPublisher(
  store: AgentSessionStore,
  options: VisualCommandPublisherOptions = {},
): VisualIntentHandler {
  return (intent: VisualIntent) => {
    if (intent.kind === "focus_region") {
      options.onFocusRegion?.(intent.regionId);
      return;
    }
    if (intent.kind === "pin_observation") {
      options.onPinObservation?.(intent.observation);
      return;
    }
    if (intent.kind === "annotation") {
      store.applyAnnotations([intent.annotation]);
      if (intent.annotation.type === "focus") {
        options.onFocusAnnotationCommitted?.(intent.annotation, store.getSession().revision);
        options.onFocusComponent?.(intent.annotation.componentId);
      }
      if (intent.annotation.type === "path") {
        options.onFocusConnection?.(intent.annotation.connectionId);
      }
      return;
    }
    if (intent.kind === "clear") {
      store.clearAnnotations(intent.scope, intent.componentId);
      return;
    }
    if (process.env.NODE_ENV === "development") {
      console.warn("[Faultline] Ignored unsupported visual command.", intent);
    }
  };
}
