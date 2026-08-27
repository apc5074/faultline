import type { PinnedObservation, TraceRequestOutput } from "@faultline/agent-capabilities";
import type { Architecture, RegionId } from "@faultline/core";
import type { VisualIntent, VisualIntentHandler } from "@faultline/webmcp";

import type { AgentSessionStore } from "./AgentSessionProvider";

export interface VisualCommandPublisherOptions {
  /**
   * Keeps a valid focus command legible in the host presentation without
   * giving the command access to architecture or simulation state.
   */
  readonly onFocusComponent?: (componentId: string) => void;
  readonly onFocusRegion?: (regionId: RegionId) => void;
  readonly onHighlightTrace?: (trace: TraceRequestOutput) => void;
  readonly onPinObservation?: (observation: PinnedObservation) => void;
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
    if (intent.kind === "highlight_trace") {
      options.onHighlightTrace?.(intent.trace);
      return;
    }
    if (intent.kind === "pin_observation") {
      options.onPinObservation?.(intent.observation);
      return;
    }
    if (intent.kind === "annotation") {
      store.applyAnnotations([intent.annotation]);
      if (intent.annotation.type === "focus") {
        options.onFocusComponent?.(intent.annotation.componentId);
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

/** @deprecated Use createVisualCommandPublisher. */
export function createVisualIntentHandler(
  store: AgentSessionStore,
  _getArchitecture?: () => Architecture,
): VisualIntentHandler {
  return createVisualCommandPublisher(store);
}
