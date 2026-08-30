"use client";

import {
  architectureAvailabilityFingerprint,
  createEmptyAgentSessionState,
  type AgentAnnotation,
  type AgentPendingHelpRequest,
  type AgentSessionFocus,
  type AgentSessionState,
  type ExperimentConsent,
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
  clearFocusAnnotationsOnRun,
  clearSessionAnnotations,
  pruneSessionForArchitecture,
  sessionChangedByPrune,
  withPendingHelpRequest,
  withSessionFocus,
} from "./session-mutations";
import { createWebMcpEvidenceSource, type WebMcpEvidenceSource } from "../webmcp/evidence-store";

export interface AgentSessionStore {
  getSession(): AgentSessionState;
  setFocus(focus: AgentSessionFocus): void;
  setPendingHelp(pendingHelpRequest: AgentPendingHelpRequest | null): void;
  applyAnnotations(annotations: readonly AgentAnnotation[]): void;
  clearAnnotations(scope?: "all" | "component", componentId?: string): void;
  /** Drop ephemeral focus ticks; keep notes/paths (Run lifecycle). */
  clearFocusOnRun(): void;
  setExperimentConsent(consent: ExperimentConsent | null): void;
}

interface AgentSessionContextValue {
  store: AgentSessionStore;
  getAgentContext: LiveAgentContextFactory;
  webMcpEvidenceSource: WebMcpEvidenceSource;
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
    const previous = sessionRef.current;
    const pruned = pruneSessionForArchitecture(previous, architectureRef.current);
    const consentMatchesRevision = !previous.experimentConsent || previous.experimentConsent.architectureRevision === architectureAvailabilityFingerprint(architectureRef.current);
    const nextSession = consentMatchesRevision ? pruned : { ...pruned, experimentConsent: null };
    if (!sessionChangedByPrune(previous, nextSession) && consentMatchesRevision) return;
    sessionRef.current = {
      ...nextSession,
      revision: previous.revision,
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
      clearFocusOnRun: () => {
        commitSession(clearFocusAnnotationsOnRun(sessionRef.current));
      },
      setExperimentConsent: (experimentConsent) => {
        commitSession({ ...sessionRef.current, experimentConsent, revision: sessionRef.current.revision + 1 });
      },
    }),
    [commitSession],
  );

  const webMcpEvidenceSource = useMemo(
    () => createWebMcpEvidenceSource({
      getArchitecture: () => architectureRef.current,
      getChallenge: () => challengeRef.current,
      getSession: () => sessionRef.current,
    }),
    [],
  );

  useEffect(() => () => webMcpEvidenceSource.dispose(), [webMcpEvidenceSource]);

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
      webMcpEvidenceSource,
      sessionVersion,
    }),
    [store, getAgentContext, webMcpEvidenceSource, sessionVersion],
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

export function useWebMcpEvidenceSource(): WebMcpEvidenceSource {
  const value = useContext(AgentSessionContext);
  if (!value) throw new Error("useWebMcpEvidenceSource must be used within AgentSessionProvider.");
  return value.webMcpEvidenceSource;
}

export function useOptionalAgentContextFactory(): LiveAgentContextFactory | null {
  return useContext(AgentSessionContext)?.getAgentContext ?? null;
}
