import { useCallback, useRef } from "react";
import type { Architecture, ChallengeDefinition } from "@faultline/core";
import { createEmptyAgentSessionState } from "@faultline/agent-capabilities";

import {
  createAgentContext,
  type LiveAgentContextFactory,
} from "./create-agent-context";

/**
 * React hook that keeps a stable factory while always reading the newest
 * architecture draft and trusted active challenge through refs.
 * Session state is empty until an AgentSessionProvider is mounted.
 */
export function useLiveAgentContextFactory(
  architecture: Architecture,
  challenge: ChallengeDefinition,
): LiveAgentContextFactory {
  const architectureRef = useRef(architecture);
  const challengeRef = useRef(challenge);
  architectureRef.current = architecture;
  challengeRef.current = challenge;

  return useCallback(
    () => ({
      context: createAgentContext(architectureRef.current, challengeRef.current),
      session: createEmptyAgentSessionState(),
    }),
    [],
  );
}
