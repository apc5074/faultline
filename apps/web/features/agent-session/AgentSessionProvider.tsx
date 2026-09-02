"use client";

import {
  architectureAvailabilityFingerprint,
  createEmptyAgentSessionState,
  type AgentAnnotation,
  type AgentPendingHelpRequest,
  type AgentSessionFocus,
  type AgentSessionState,
  type ComponentCameraApplication,
  type ComponentExplanationPresentation,
  type VisualApplicationReceipt,
  type InterviewService,
  type InterviewServiceSnapshot,
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
import { buildWebMcpEvidenceKey, createWebMcpEvidenceSource, type WebMcpEvidenceSource } from "../webmcp/evidence-store";
import { createDesignInterviewV2HostService } from "./interview-v2-host-service";

export interface AgentSessionStore {
  getSession(): AgentSessionState;
  setFocus(focus: AgentSessionFocus): void;
  setPendingHelp(pendingHelpRequest: AgentPendingHelpRequest | null): void;
  applyAnnotations(annotations: readonly AgentAnnotation[]): void;
  clearAnnotations(scope?: "all" | "component", componentId?: string): void;
  /** Drop ephemeral focus ticks; keep notes/paths (Run lifecycle). */
  clearFocusOnRun(): void;
}

export interface ComponentExplanationBarrier {
  awaitPresentation(command: ComponentExplanationPresentation, options: {
    readonly signal?: AbortSignal;
    readonly camera: Promise<ComponentCameraApplication>;
  }): Promise<VisualApplicationReceipt>;
  acknowledgeFocusRendered(annotation: { readonly id: string; readonly intentId?: string; readonly componentId: string; readonly architectureRevision?: string }, appliedSessionRevision: number): void;
}

interface PendingComponentPresentation {
  readonly command: ComponentExplanationPresentation;
  readonly resolve: (receipt: VisualApplicationReceipt) => void;
  readonly reject: (reason: Error) => void;
  annotationRevision?: number;
  camera?: ComponentCameraApplication;
}

function completedPresentationReceipt(pending: PendingComponentPresentation): VisualApplicationReceipt | undefined {
  if (pending.annotationRevision === undefined || pending.camera === undefined) return undefined;
  return {
    contractVersion: pending.command.contractVersion,
    commandId: pending.command.commandId,
    componentId: pending.command.component.entityId,
    evidenceRevision: pending.command.evidenceRevision,
    appliedSessionRevision: pending.annotationRevision,
    annotationStatus: "rendered",
    cameraStatus: "centered",
    appliedZoom: pending.camera.zoom,
    status: "applied",
  };
}

interface AgentSessionContextValue {
  store: AgentSessionStore;
  getAgentContext: LiveAgentContextFactory;
  webMcpEvidenceSource: WebMcpEvidenceSource;
  interviewService: InterviewService;
  interviewSnapshot: InterviewServiceSnapshot | null;
  currentArchitectureRevision: string;
  sessionVersion: number;
  componentExplanationBarrier: ComponentExplanationBarrier;
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
  const pendingPresentationRef = useRef(new Map<string, PendingComponentPresentation>());
  const [sessionVersion, setSessionVersion] = useState(0);
  // The provider renders on the server too; never resolve the browser owner
  // key or touch localStorage until the client has mounted.
  const interviewService = useMemo(
    () => createDesignInterviewV2HostService(typeof window === "undefined" ? "ssr-placeholder" : undefined),
    [],
  );
  const [interviewSnapshot, setInterviewSnapshot] = useState<InterviewServiceSnapshot | null>(null);

  const architectureFingerprint = useMemo(
    () => architectureAvailabilityFingerprint(architecture),
    [architecture],
  );
  const semanticEvidenceKey = useMemo(
    () => buildWebMcpEvidenceKey(architecture, challenge),
    [architecture, challenge],
  );

  useEffect(() => {
    for (const pending of pendingPresentationRef.current.values()) {
      if (pending.command.evidenceRevision !== createAgentContext(architectureRef.current, challengeRef.current).evidenceMeta?.architectureRevision) {
        pending.reject(new Error("Architecture evidence changed."));
        pendingPresentationRef.current.delete(pending.command.commandId);
      }
    }
    const previous = sessionRef.current;
    const pruned = pruneSessionForArchitecture(previous, architectureRef.current);
    const nextSession = pruned;
    if (!sessionChangedByPrune(previous, nextSession)) return;
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
    }),
    [commitSession],
  );

  const componentExplanationBarrier = useMemo<ComponentExplanationBarrier>(() => ({
    awaitPresentation: (command, { signal, camera }) => new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
      const abort = () => {
        pendingPresentationRef.current.delete(command.commandId);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      const pending: PendingComponentPresentation = {
        command,
        resolve: (receipt) => { signal?.removeEventListener("abort", abort); resolve(receipt); },
        reject: (reason) => { signal?.removeEventListener("abort", abort); reject(reason); },
      };
      pendingPresentationRef.current.set(command.commandId, pending);
      camera.then((application) => {
        const current = pendingPresentationRef.current.get(command.commandId);
        if (current !== pending) return;
        if (application.componentId !== command.component.entityId || application.status !== "centered") {
          pendingPresentationRef.current.delete(command.commandId);
          pending.reject(new Error("Component camera applied to the wrong target."));
          return;
        }
        pending.camera = application;
        const receipt = completedPresentationReceipt(pending);
        if (!receipt) return;
        pendingPresentationRef.current.delete(command.commandId);
        pending.resolve(receipt);
      }, (reason: unknown) => {
        if (pendingPresentationRef.current.get(command.commandId) !== pending) return;
        pendingPresentationRef.current.delete(command.commandId);
        pending.reject(reason instanceof Error ? reason : new Error("Component camera failed."));
      });
    }),
    acknowledgeFocusRendered: (annotation, appliedSessionRevision) => {
      const commandId = annotation.intentId ?? annotation.id;
      if (!commandId) return;
      const pending = pendingPresentationRef.current.get(commandId);
      if (!pending) return;
      if (annotation.componentId !== pending.command.component.entityId || annotation.architectureRevision !== pending.command.evidenceRevision) {
        pendingPresentationRef.current.delete(commandId);
        pending.reject(new Error("Focus annotation was superseded."));
        return;
      }
      pending.annotationRevision = appliedSessionRevision;
      const receipt = completedPresentationReceipt(pending);
      if (!receipt) return;
      pendingPresentationRef.current.delete(commandId);
      pending.resolve(receipt);
    },
  }), []);

  useEffect(() => () => {
    for (const pending of pendingPresentationRef.current.values()) pending.reject(new Error("Presentation owner unmounted."));
    pendingPresentationRef.current.clear();
  }, []);

  const webMcpEvidenceSource = useMemo(
    () => createWebMcpEvidenceSource({
      getArchitecture: () => architectureRef.current,
      getChallenge: () => challengeRef.current,
      getSession: () => sessionRef.current,
    }),
    [],
  );

  useEffect(() => () => webMcpEvidenceSource.dispose(), [webMcpEvidenceSource]);

  useEffect(() => {
    webMcpEvidenceSource.prewarm();
  }, [webMcpEvidenceSource, semanticEvidenceKey]);

  useEffect(() => {
    try {
      const synced = interviewService.syncArchitecture?.(createAgentContext(architectureRef.current, challengeRef.current));
      if (synced instanceof Promise) void synced.catch(() => undefined);
    } catch {
      // No active interview is the normal state before the player starts one.
    }
  }, [interviewService, semanticEvidenceKey]);

  const getAgentContext = useCallback(() => {
    return {
      context: createAgentContext(architectureRef.current, challengeRef.current),
      session: sessionRef.current,
    };
  }, []);

  useEffect(() => {
    const unsubscribe = interviewService.subscribe?.((snapshot) => setInterviewSnapshot(snapshot));
    try {
      const loaded = interviewService.get(createAgentContext(architectureRef.current, challengeRef.current));
      if (loaded instanceof Promise) void loaded.then(setInterviewSnapshot).catch(() => setInterviewSnapshot(null));
      else setInterviewSnapshot(loaded);
    } catch {
      setInterviewSnapshot(null);
    }
    return unsubscribe;
  }, [interviewService]);

  const currentArchitectureRevision = useMemo(
    () => createAgentContext(architecture, challenge).evidenceMeta?.architectureRevision ?? "unversioned",
    [architecture, challenge],
  );

  const value = useMemo(
    () => ({
      store,
      getAgentContext,
      webMcpEvidenceSource,
      interviewService,
      interviewSnapshot,
      currentArchitectureRevision,
      sessionVersion,
      componentExplanationBarrier,
    }),
    [store, getAgentContext, webMcpEvidenceSource, interviewService, interviewSnapshot, currentArchitectureRevision, sessionVersion, componentExplanationBarrier],
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

export function useInterviewSnapshot(): InterviewServiceSnapshot | null {
  const value = useContext(AgentSessionContext);
  if (!value) throw new Error("useInterviewSnapshot must be used within AgentSessionProvider.");
  void value.sessionVersion;
  return value.interviewSnapshot;
}

export function useInterviewService(): InterviewService {
  const value = useContext(AgentSessionContext);
  if (!value) throw new Error("useInterviewService must be used within AgentSessionProvider.");
  return value.interviewService;
}

export function useCurrentArchitectureRevision(): string {
  const value = useContext(AgentSessionContext);
  if (!value) throw new Error("useCurrentArchitectureRevision must be used within AgentSessionProvider.");
  return value.currentArchitectureRevision;
}

export function useOptionalAgentContextFactory(): LiveAgentContextFactory | null {
  return useContext(AgentSessionContext)?.getAgentContext ?? null;
}

export function useComponentExplanationBarrier(): ComponentExplanationBarrier {
  const value = useContext(AgentSessionContext);
  if (!value) throw new Error("useComponentExplanationBarrier must be used within AgentSessionProvider.");
  return value.componentExplanationBarrier;
}
