import type { Architecture } from "@faultline/core";
import type { VisualIntent, VisualIntentHandler } from "@faultline/webmcp";

import type { AgentSessionStore } from "./AgentSessionProvider";

/**
 * The single client-side visual-command publisher. Adapters produce validated
 * intents; this publisher is the only place that applies coaching state.
 * Playback/observation commands can be added here without giving an adapter
 * its own annotation store.
 */
export function createVisualCommandPublisher(store: AgentSessionStore): VisualIntentHandler {
  return (intent: VisualIntent) => {
    if (intent.kind === "annotation") {
      store.applyAnnotations([intent.annotation]);
      return;
    }
    store.clearAnnotations(intent.scope, intent.componentId);
  };
}

/** @deprecated Use createVisualCommandPublisher. */
export function createVisualIntentHandler(
  store: AgentSessionStore,
  _getArchitecture?: () => Architecture,
): VisualIntentHandler {
  return createVisualCommandPublisher(store);
}
