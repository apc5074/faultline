import type {
  AgentComponentEvidence,
  AgentWorkloadChannelEvidence,
  AgentContext,
  AgentSessionState,
  LiveAgentSnapshot,
} from "@faultline/agent-capabilities";
import { buildReviewRevisionDelta, buildReviewUseCasePackets } from "@faultline/agent-capabilities";
import type { Architecture, ChallengeDefinition } from "@faultline/core";
import { SIMULATOR_VERSION } from "@faultline/simulator";
import { architectureEvidenceFingerprint } from "@faultline/agent-capabilities";

import { createAgentContext, createPlayerRunAgentContext } from "../../lib/agent-context/create-agent-context.ts";

export interface WebMcpEvidenceIndexes {
  readonly components: ReadonlyMap<string, AgentComponentEvidence>;
  readonly requirements: ReadonlyMap<string, ChallengeDefinition["requirements"][number]>;
  readonly workloadChannels: ReadonlyMap<string, AgentWorkloadChannelEvidence>;
  readonly connections: ReadonlyMap<string, Architecture["connections"][number]>;
  readonly costContributors: readonly string[];
}

export interface PreparedWebMcpEvidence {
  readonly key: string;
  readonly context: AgentContext;
  readonly indexes: WebMcpEvidenceIndexes;
}

export interface WebMcpEvidenceSource {
  /** Re-enable a provider-owned source after a development Strict Mode probe. */
  activate(): void;
  getEvidence(signal?: AbortSignal): Promise<PreparedWebMcpEvidence>;
  getSnapshot(signal?: AbortSignal): Promise<LiveAgentSnapshot>;
  getEvidenceRevision(): string;
  getSession(): AgentSessionState;
  /** Retain the last player-visible Run as a comparison baseline (WMP-018). */
  recordPlayerRun(runKey: string): Promise<PreparedWebMcpEvidence>;
  prewarm(): void;
  dispose(): void;
}

type BuildContext = (architecture: Architecture, challenge: ChallengeDefinition) => AgentContext | Promise<AgentContext>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function semanticArchitecture(architecture: Architecture): unknown {
  return {
    version: architecture.version,
    components: architecture.components.map(({ ui: _ui, ...component }) => component),
    connections: architecture.connections,
  };
}

export function webMcpEvidenceKey(architecture: Architecture, challenge: ChallengeDefinition): string {
  // Keep the canonical serialized identity exact. A short 32-bit digest can
  // collide and silently return another architecture's prepared evidence.
  return `wmp2-${stable({ architecture: semanticArchitecture(architecture), challenge, simulatorVersion: SIMULATOR_VERSION, contract: "wmp2" })}`;
}

function buildIndexes(context: AgentContext): WebMcpEvidenceIndexes {
  const components = new Map<string, AgentComponentEvidence>();
  const workloadChannels = new Map<string, AgentWorkloadChannelEvidence>();
  if (context.simulation?.available) {
    for (const [id, evidence] of Object.entries(context.simulation.components)) components.set(id, evidence);
    for (const [id, evidence] of Object.entries(context.simulation.workloadPaths ?? {})) workloadChannels.set(id, evidence);
  }
  return {
    components,
    requirements: new Map(context.challenge.requirements.map((requirement) => [requirement.id, requirement])),
    workloadChannels,
    connections: new Map(context.architecture.connections.map((connection) => [connection.id, connection])),
    costContributors: [...new Set((context.cost?.lineItems ?? []).map((line) => line.componentId))].sort(),
  };
}

function attachComparisonBaselines(
  context: AgentContext,
  previousReview?: AgentContext,
  playerRun?: AgentContext,
): AgentContext {
  const comparisonBaselines = {
    ...(previousReview ? { previousReview } : {}),
    ...(playerRun ? { lastPlayerRun: playerRun } : {}),
  };
  return Object.keys(comparisonBaselines).length > 0 ? { ...context, comparisonBaselines } : context;
}

export function createWebMcpEvidenceSource(options: {
  readonly getArchitecture: () => Architecture;
  readonly getChallenge: () => ChallengeDefinition;
  readonly getSession: () => AgentSessionState;
  readonly buildContext?: BuildContext;
}): WebMcpEvidenceSource {
  const buildContext = options.buildContext ?? createAgentContext;
  let completed: PreparedWebMcpEvidence | undefined;
  let history: PreparedWebMcpEvidence[] = [];
  let lastPlayerRun: PreparedWebMcpEvidence | undefined;
  let inFlight: { key: string; promise: Promise<PreparedWebMcpEvidence> } | undefined;
  let disposed = false;

  function buildPlayerRunContext(architecture: Architecture, challenge: ChallengeDefinition, runKey: string): Promise<AgentContext> {
    if (buildContext === createAgentContext) {
      return Promise.resolve(createPlayerRunAgentContext(architecture, challenge, runKey));
    }
    return Promise.resolve(buildContext(architecture, challenge)).then((context) => ({
      ...context,
      evidenceMeta: context.evidenceMeta
        ? { ...context.evidenceMeta, simulationRunId: `run-${runKey}` }
        : {
            architectureRevision: architectureEvidenceFingerprint(architecture),
            simulationRunId: `run-${runKey}`,
            simulatorVersion: SIMULATOR_VERSION,
            isStale: context.simulation?.available !== true,
            generatedAt: new Date().toISOString(),
          },
    }));
  }

  function prepareEvidence(key: string, context: AgentContext, previous?: PreparedWebMcpEvidence): PreparedWebMcpEvidence {
    const indexes = buildIndexes(context);
    const reviewPackets = buildReviewUseCasePackets({ ...context, reviewPackets: undefined });
    const preparedContext = attachComparisonBaselines(
      {
        ...context,
        reviewPackets,
        ...(previous ? { reviewDelta: buildReviewRevisionDelta(previous.context, { ...context, reviewPackets }) } : {}),
      },
      previous?.context,
      lastPlayerRun?.context,
    );
    return { key, context: preparedContext, indexes };
  }

  function currentInputs() {
    const architecture = options.getArchitecture();
    const challenge = options.getChallenge();
    return { architecture, challenge, key: webMcpEvidenceKey(architecture, challenge) };
  }

  function start(key: string, architecture: Architecture, challenge: ChallengeDefinition): Promise<PreparedWebMcpEvidence> {
    const promise = Promise.resolve(buildContext(architecture, challenge)).then((context) => {
      const previous = history.at(-1);
      const prepared = prepareEvidence(key, context, previous);
      const isCurrent = currentInputs().key === key;
      if (isCurrent) history = [...history.filter((entry) => entry.key !== key), prepared].slice(-2);
      if (!disposed && isCurrent && inFlight?.key === key) completed = prepared;
      if (inFlight?.key === key) inFlight = undefined;
      return prepared;
    }, (error: unknown) => {
      if (inFlight?.key === key) inFlight = undefined;
      throw error;
    });
    inFlight = { key, promise };
    return promise;
  }

  function recordPlayerRun(runKey: string): Promise<PreparedWebMcpEvidence> {
    if (disposed) return Promise.reject(new Error("WebMCP evidence source is disposed."));
    const { architecture, challenge, key } = currentInputs();
    return buildPlayerRunContext(architecture, challenge, runKey).then((context) => {
      lastPlayerRun = prepareEvidence(key, context);
      if (completed?.key === key) {
        const { comparisonBaselines: _comparisonBaselines, reviewPackets: _reviewPackets, reviewDelta: _reviewDelta, ...baseContext } = completed.context;
        completed = prepareEvidence(key, baseContext, history.at(-1));
      }
      return lastPlayerRun;
    });
  }

  function getEvidence(signal?: AbortSignal): Promise<PreparedWebMcpEvidence> {
    if (disposed) return Promise.reject(new Error("WebMCP evidence source is disposed."));
    const { architecture, challenge, key } = currentInputs();
    const promise = completed?.key === key
      ? Promise.resolve(completed)
      : inFlight?.key === key
        ? inFlight.promise
        : start(key, architecture, challenge);
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      promise.then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); });
    });
  }

  return {
    activate: () => { disposed = false; },
    getEvidence,
    getEvidenceRevision: () => architectureEvidenceFingerprint(currentInputs().architecture),
    getSnapshot: async (signal) => ({ context: (await getEvidence(signal)).context, session: options.getSession() }),
    getSession: options.getSession,
    recordPlayerRun,
    prewarm: () => { void getEvidence().catch(() => undefined); },
    dispose: () => { disposed = true; completed = undefined; inFlight = undefined; history = []; lastPlayerRun = undefined; },
  };
}
