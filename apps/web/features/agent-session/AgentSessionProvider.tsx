"use client";

import {
  architectureAvailabilityFingerprint,
  createEmptyAgentSessionState,
  type AgentAnnotation,
  type AgentPendingHelpRequest,
  type AgentSessionFocus,
  type AgentSessionState,
} from "@faultline/agent-capabilities";
import type { Architecture, ChallengeDefinition } from "@faultline/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createAgentContext,
  type LiveAgentContextFactory,
} from "@/lib/agent-context/create-agent-context";

import {
  applySessionAnnotations,
  clearSessionAnnotations,
  pruneSessionForArchitecture,
  withPendingHelpRequest,
  withSessionFocus,
} from "./session-mutations";

export interface AgentSessionStore {
  getSession(): AgentSessionState;
  setFocus(focus: AgentSessionFocus): void;
  setPendingHelp(pendingHelpRequest: AgentPendingHelpRequest | null): void;
  applyAnnotations(annotations: readonly AgentAnnotation[]): void;
  clearAnnotations(scope?: "all" | "component", componentId?: string): void;
}

interface AgentSessionContextValue {
  store: AgentSessionStore;
  getAgentContext: LiveAgentContextFactory;
  sessionVersion: number;
}

const AgentSessionContext = createContext<AgentSessionContextValue | null>(null);

export function AgentSessionProvider({
  architecture,
  challenge,
  children,
}: {
  architecture: Architecture;
  challenge: ChallengeDefinition;
  children: ReactNode;
}) {
  const architectureRef = useRef(architecture);
  const challengeRef = useRef(challenge);
  architectureRef.current = architecture;
  challengeRef.current = challenge;

  const sessionRef = useRef<AgentSessionState>(createEmptyAgentSessionState());
  const [sessionVersion, setSessionVersion] = useState(0);

  const architectureFingerprint = useMemo(
    () => architectureAvailabilityFingerprint(architecture),
    [architecture],
  );

  useEffect(() => {
    const pruned = pruneSessionForArchitecture(sessionRef.current, architectureRef.current);
    sessionRef.current = {
      ...pruned,
      revision: sessionRef.current.revision,
    };
    setSessionVersion((version) => version + 1);
  }, [architectureFingerprint]);

  const commitSession = useCallback((next: AgentSessionState) => {
    sessionRef.current = next;
    setSessionVersion((version) => version + 1);
  }, []);

  const store = useMemo<AgentSessionStore>(
    () => ({
      getSession: () => sessionRef.current,
      setFocus: (focus) => {
        commitSession(withSessionFocus(sessionRef.current, focus, architectureRef.current));
      },
      setPendingHelp: (pendingHelpRequest) => {
        commitSession(
          withPendingHelpRequest(sessionRef.current, pendingHelpRequest, architectureRef.current),
        );
      },
      applyAnnotations: (annotations) => {
        commitSession(
          applySessionAnnotations(sessionRef.current, architectureRef.current, annotations),
        );
      },
      clearAnnotations: (scope = "all", componentId) => {
        commitSession(clearSessionAnnotations(sessionRef.current, scope, componentId));
      },
    }),
    [commitSession],
  );

  const getAgentContext = useCallback(() => {
    return {
      context: createAgentContext(architectureRef.current, challengeRef.current),
      session: sessionRef.current,
    };
  }, []);

  const value = useMemo(
    () => ({
      store,
      getAgentContext,
      sessionVersion,
    }),
    [store, getAgentContext, sessionVersion],
  );

  return <AgentSessionContext.Provider value={value}>{children}</AgentSessionContext.Provider>;
}

export function useAgentSessionStore(): AgentSessionStore {
  const value = useContext(AgentSessionContext);
  if (!value) {
    throw new Error("useAgentSessionStore must be used within AgentSessionProvider.");
  }
  return value.store;
}

/** Re-render when session revision changes (focus, help, annotations). */
export function useAgentSessionState(): AgentSessionState {
  const value = useContext(AgentSessionContext);
  if (!value) {
    throw new Error("useAgentSessionState must be used within AgentSessionProvider.");
  }
  void value.sessionVersion;
  return value.store.getSession();
}

export function useAgentContextFactory(): LiveAgentContextFactory {
  const value = useContext(AgentSessionContext);
  if (!value) {
    throw new Error("useAgentContextFactory must be used within AgentSessionProvider.");
  }
  return value.getAgentContext;
}

export function useOptionalAgentContextFactory(): LiveAgentContextFactory | null {
  return useContext(AgentSessionContext)?.getAgentContext ?? null;
}
