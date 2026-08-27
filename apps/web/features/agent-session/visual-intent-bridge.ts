import type { Architecture } from "@faultline/core";
import type { VisualIntent, VisualIntentHandler } from "@faultline/webmcp";

import type { AgentSessionStore } from "./AgentSessionProvider";

/** Bridge WebMCP visual intents into the client session store. */
export function createVisualIntentHandler(
  store: AgentSessionStore,
  _getArchitecture: () => Architecture,
): VisualIntentHandler {
  return (intent: VisualIntent) => {
    if (intent.kind === "annotation") {
      store.applyAnnotations([intent.annotation]);
      return;
    }
    store.clearAnnotations(intent.scope, intent.componentId);
  };
}
