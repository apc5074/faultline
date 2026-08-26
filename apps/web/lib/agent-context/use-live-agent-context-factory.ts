import { useCallback, useRef } from "react";
import type { Architecture, ChallengeDefinition } from "@faultline/core";

import { createAgentContext, type LiveAgentContextFactory } from "./create-agent-context";

/**
 * React hook that keeps a stable factory while always reading the newest
 * architecture draft and trusted active challenge through refs.
 */
export function useLiveAgentContextFactory(
  architecture: Architecture,
  challenge: ChallengeDefinition,
): LiveAgentContextFactory {
  const architectureRef = useRef(architecture);
  const challengeRef = useRef(challenge);
  architectureRef.current = architecture;
  challengeRef.current = challenge;

  return useCallback(() => createAgentContext(architectureRef.current, challengeRef.current), []);
}
