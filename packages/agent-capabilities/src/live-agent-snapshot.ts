import type { AgentContext } from "./context.js";
import { createEmptyAgentSessionState, type LiveAgentSnapshot } from "./session.js";

/** Normalize adapter context factories that return domain-only or live snapshots. */
export function resolveLiveAgentSnapshot(snapshot: AgentContext | LiveAgentSnapshot): LiveAgentSnapshot {
  if ("context" in snapshot && "session" in snapshot) {
    return snapshot;
  }
  return {
    context: snapshot,
    session: createEmptyAgentSessionState(),
  };
}
