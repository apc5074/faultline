import type { AgentCapabilityMode, AgentCapabilityRegistry, PresentationCue } from "@faultline/agent-capabilities";
import { productionCapabilityGroup, PRODUCTION_CAPABILITY_MANIFEST_VERSION, resolveLiveAgentSnapshot } from "@faultline/agent-capabilities";
import type { ExperimentResult } from "@faultline/core";
import { buildVisualWebMcpSurface } from "./agent-visual-surface.js";
import { buildExperimentWebMcpSurface } from "./experiment-webmcp-surface.js";
import { buildAgentReadSurface } from "./phase6-read-surface.js";
import type { WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpModelContext, WebMcpRegisterToolOptions, WebMcpTool } from "./types.js";
import { measureWebMcpTiming, recordWebMcpTrace, type WebMcpTimingSink, type WebMcpTraceSink } from "./timing.js";
import type { VisualIntentHandler } from "./visual-intent.js";

/** Browser registration deadline derived from the WMP-001 lifecycle baseline. */
export const WEBMCP_REGISTRATION_DEADLINE_MS = 2_000;

/** Independently owned registration groups. "all" preserves the legacy adapter API. */
export type WebMcpRegistrationGroup = "all" | "stable-review" | "stable-visual" | "specialists" | "experiments";

export interface WebMcpRegistrationManifest {
  readonly contractVersion: typeof PRODUCTION_CAPABILITY_MANIFEST_VERSION;
  readonly revision: string;
  readonly tools: readonly WebMcpTool[];
  readonly namesByMode: Readonly<Record<AgentCapabilityMode, readonly string[]>>;
  readonly skipped: readonly string[];
  readonly fingerprint: string;
}

export interface RegisterAgentWebMcpSurfaceOptions {
  readonly modelContext: WebMcpModelContext;
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  readonly getCurrentEvidenceRevision?: () => string;
  readonly signal: AbortSignal;
  readonly development?: boolean;
  readonly onVisualIntent?: VisualIntentHandler;
  readonly onExperimentResult?: (result: ExperimentResult) => void;
  readonly onPresentationCue?: (cue: PresentationCue) => void;
  readonly timing?: WebMcpTimingSink;
  readonly trace?: WebMcpTraceSink;
  readonly traceGeneration?: number;
  /** Limit this registration generation to one independently reconciled group. */
  readonly group?: WebMcpRegistrationGroup;
}

export interface RegisterAgentWebMcpSurfaceResult {
  readonly group?: WebMcpRegistrationGroup;
  readonly resolvedToolNames: readonly string[];
  readonly registeredToolNames: readonly string[];
  readonly failedToolNames: readonly string[];
  readonly readToolNames: readonly string[];
  readonly visualToolNames: readonly string[];
  readonly experimentToolNames: readonly string[];
  readonly manifest?: WebMcpRegistrationManifest;
}

function abortedResult(group: WebMcpRegistrationGroup): RegisterAgentWebMcpSurfaceResult {
  return { ...(group !== "all" ? { group } : {}), resolvedToolNames: [], registeredToolNames: [], failedToolNames: [], readToolNames: [], visualToolNames: [], experimentToolNames: [] };
}

function fingerprintManifest(tools: readonly WebMcpTool[]): string {
  return JSON.stringify({ contractVersion: PRODUCTION_CAPABILITY_MANIFEST_VERSION, tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations ?? null })) });
}

/** Build one coherent manifest from one prepared context, then register in manifest order. */
export async function registerAgentWebMcpSurface(options: RegisterAgentWebMcpSurfaceOptions): Promise<RegisterAgentWebMcpSurfaceResult> {
  const { modelContext, registry, getContext, getCurrentEvidenceRevision, signal, development = false, onVisualIntent, onExperimentResult, onPresentationCue, timing, trace, traceGeneration, group = "all" } = options;
  recordWebMcpTrace(trace, { name: "registration_started", group, ...(traceGeneration !== undefined ? { generation: traceGeneration } : {}) });
  const startedAt = performance.now();
  if (signal.aborted) return abortedResult(group);
  const context = resolveLiveAgentSnapshot(await getContext()).context;
  if (signal.aborted) return abortedResult(group);
  const includeRead = group === "all" || group === "stable-review" || group === "specialists";
  const includeVisual = group === "all" || group === "stable-visual";
  const includeExperiments = group === "all" || group === "experiments";
  const [read, visual, experiment] = await Promise.all([
    includeRead
      ? measureWebMcpTiming(timing, "surface_build_ms", () => buildAgentReadSurface({ registry, getContext, getCurrentEvidenceRevision, context, development, timing, trace, profile: "production", ...(onPresentationCue ? { onPresentationCue } : {}) }), { mode: "read" })
      : Promise.resolve({ tools: [], skipped: [], resolvedNames: [] }),
    includeVisual
      ? measureWebMcpTiming(timing, "surface_build_ms", () => buildVisualWebMcpSurface({ registry, getContext, getCurrentEvidenceRevision, context, development, timing, trace, profile: "production", ...(onVisualIntent ? { onVisualIntent } : {}), ...(onPresentationCue ? { onPresentationCue } : {}) }), { mode: "visual" })
      : Promise.resolve({ tools: [], skipped: [], resolvedNames: [] }),
    includeExperiments
      ? measureWebMcpTiming(timing, "surface_build_ms", () => buildExperimentWebMcpSurface({ registry, getContext, getCurrentEvidenceRevision, context, development, timing, trace, ...(onExperimentResult ? { onExperimentResult } : {}), ...(onPresentationCue ? { onPresentationCue } : {}) }), { mode: "experiment" })
      : Promise.resolve({ tools: [], skipped: [], resolvedNames: [] }),
  ]);
  if (signal.aborted) return abortedResult(group);
  const readTools = group === "stable-review" || group === "specialists"
    ? read.tools.filter((tool) => productionCapabilityGroup(tool.name) === group)
    : read.tools;
  const tools = [...readTools, ...visual.tools, ...experiment.tools];
  const namesByMode = { read: readTools.map(({ name }) => name), visual: visual.tools.map(({ name }) => name), experiment: experiment.tools.map(({ name }) => name) } as const;
  const manifest: WebMcpRegistrationManifest = {
    contractVersion: PRODUCTION_CAPABILITY_MANIFEST_VERSION,
    revision: getCurrentEvidenceRevision?.() ?? context.evidenceMeta?.architectureRevision ?? "unversioned",
    tools,
    namesByMode,
    skipped: [...read.skipped.map(({ name }) => name), ...visual.skipped.map(({ name }) => name), ...experiment.skipped.map(({ name }) => name)],
    fingerprint: fingerprintManifest(tools),
  };
  const registrationResults = await Promise.all(tools.map(async (tool, index) => {
    if (signal.aborted) return { index, status: "aborted" as const };
    try {
      await modelContext.registerTool(tool, { signal } satisfies WebMcpRegisterToolOptions);
      return { index, status: signal.aborted ? "aborted" as const : "registered" as const };
    } catch {
      return { index, status: signal.aborted ? "aborted" as const : "failed" as const };
    }
  }));
  const registeredToolNames: string[] = [];
  const failedToolNames: string[] = [];
  for (const result of registrationResults.sort((a, b) => a.index - b.index)) {
    const name = tools[result.index]!.name;
    if (result.status === "registered") registeredToolNames.push(name);
    if (result.status === "registered") recordWebMcpTrace(trace, { name: "tool_registered", group, ...(traceGeneration !== undefined ? { generation: traceGeneration } : {}), capability: name });
    if (result.status === "failed") failedToolNames.push(name);
  }
  timing?.({ kind: "timing", name: "registration_total_ms", durationMs: performance.now() - startedAt });
  return {
    ...(group !== "all" ? { group } : {}),
    resolvedToolNames: [...readTools.map(({ name }) => name), ...visual.tools.map(({ name }) => name), ...experiment.tools.map(({ name }) => name)],
    registeredToolNames,
    failedToolNames,
    readToolNames: registeredToolNames.filter((name) => namesByMode.read.includes(name)),
    visualToolNames: registeredToolNames.filter((name) => namesByMode.visual.includes(name)),
    experimentToolNames: registeredToolNames.filter((name) => namesByMode.experiment.includes(name)),
    manifest,
  };
}
