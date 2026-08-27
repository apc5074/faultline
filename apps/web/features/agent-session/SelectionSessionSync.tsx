"use client";

import { useEffect } from "react";

import { useAgentSessionStore } from "./AgentSessionProvider";

/** Mirror canvas component selection into agent session focus. */
export function SelectionSessionSync({ selectedComponentId }: { selectedComponentId: string | null }) {
  const sessionStore = useAgentSessionStore();

  useEffect(() => {
    if (selectedComponentId) {
      sessionStore.setFocus({
        kind: "component",
        componentId: selectedComponentId,
        source: "selection",
      });
      return;
    }
    sessionStore.setFocus({ kind: "none" });
  }, [selectedComponentId, sessionStore]);

  return null;
}
