import type {
  AgentComponentEvidence,
  AgentWorkloadChannelEvidence,
  AgentContext,
  AgentSessionState,
  LiveAgentSnapshot,
} from "@faultline/agent-capabilities";
import type { Architecture, ChallengeDefinition } from "@faultline/core";
import { SIMULATOR_VERSION } from "@faultline/simulator";

import { createAgentContext } from "../../lib/agent-context/create-agent-context.ts";

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
  getEvidence(signal?: AbortSignal): Promise<PreparedWebMcpEvidence>;
  getSnapshot(signal?: AbortSignal): Promise<LiveAgentSnapshot>;
  getSession(): AgentSessionState;
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

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function semanticArchitecture(architecture: Architecture): unknown {
  return {
    version: architecture.version,
    components: architecture.components.map(({ ui: _ui, ...component }) => component),
    connections: architecture.connections,
  };
}

export function webMcpEvidenceKey(architecture: Architecture, challenge: ChallengeDefinition): string {
  return `wmp2-${hash(stable({ architecture: semanticArchitecture(architecture), challenge, simulatorVersion: SIMULATOR_VERSION, contract: "wmp2" }))}`;
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

export function createWebMcpEvidenceSource(options: {
  readonly getArchitecture: () => Architecture;
  readonly getChallenge: () => ChallengeDefinition;
  readonly getSession: () => AgentSessionState;
  readonly buildContext?: BuildContext;
}): WebMcpEvidenceSource {
  const buildContext = options.buildContext ?? createAgentContext;
  let completed: PreparedWebMcpEvidence | undefined;
  let inFlight: { key: string; promise: Promise<PreparedWebMcpEvidence> } | undefined;
  let disposed = false;

  function currentInputs() {
    const architecture = options.getArchitecture();
    const challenge = options.getChallenge();
    return { architecture, challenge, key: webMcpEvidenceKey(architecture, challenge) };
  }

  function start(key: string, architecture: Architecture, challenge: ChallengeDefinition): Promise<PreparedWebMcpEvidence> {
    const promise = Promise.resolve(buildContext(architecture, challenge)).then((context) => {
      const prepared = { key, context, indexes: buildIndexes(context) };
      if (!disposed && inFlight?.key === key) completed = prepared;
      if (inFlight?.key === key) inFlight = undefined;
      return prepared;
    }, (error: unknown) => {
      if (inFlight?.key === key) inFlight = undefined;
      throw error;
    });
    inFlight = { key, promise };
    return promise;
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
    getEvidence,
    getSnapshot: async (signal) => ({ context: (await getEvidence(signal)).context, session: options.getSession() }),
    getSession: options.getSession,
    prewarm: () => { void getEvidence().catch(() => undefined); },
    dispose: () => { disposed = true; completed = undefined; inFlight = undefined; },
  };
}
