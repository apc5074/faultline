"use client";

import { createInterviewV2State, transitionInterviewV2, type InterviewV2Event, type InterviewV2StartEvent, type InterviewV2State } from "@faultline/agent-capabilities";
import type { Architecture } from "@faultline/core";
import { createBrowserInterviewV2Repository } from "./interview-v2-storage.ts";

export function createDesignInterviewV2Service(ownerKey: string) {
  const repository = createBrowserInterviewV2Repository(ownerKey);
  const start = (event: InterviewV2StartEvent, baselineArchitecture: Architecture) => {
    const result = createInterviewV2State(event);
    if (!result.ok) throw new Error(result.message);
    return repository.saveStarted(result.state, event, baselineArchitecture);
  };
  return {
    start,
    get: () => repository.load(),
    dispatch(event: InterviewV2Event) {
      const current = repository.load();
      if (!current) throw new Error("No active v2 interview exists.");
      const result = transitionInterviewV2(current.state, event);
      if (!result.ok) throw new Error(result.message);
      const eventId = `${event.type}-${current.revision + 1}`;
      return repository.commit({ expectedRevision: current.revision, eventId, event, state: result.state });
    },
    restart: (event: InterviewV2StartEvent, baselineArchitecture: Architecture) => { repository.clear(); return start(event, baselineArchitecture); },
    clear: () => repository.clear(),
  };
}
