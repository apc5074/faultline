"use client";

import { useAgentSessionState, useAgentSessionStore } from "./AgentSessionProvider";

/** Human-owned wipe of all agent canvas marks — does not reconnect WebMCP. */
export function ClearAgentMarksButton() {
  const store = useAgentSessionStore();
  const session = useAgentSessionState();
  const hasMarks = session.annotations.length > 0;

  return (
    <button
      type="button"
      className="sim-bar__button sim-bar__button--clear-marks"
      disabled={!hasMarks}
      title={hasMarks ? "Clear all agent marks on the canvas" : "No agent marks to clear"}
      onClick={() => store.clearAnnotations("all")}
    >
      Clear marks
    </button>
  );
}
