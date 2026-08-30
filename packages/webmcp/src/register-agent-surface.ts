import type { AgentCapabilityMode, AgentCapabilityRegistry } from "@faultline/agent-capabilities";
import { resolveLiveAgentSnapshot } from "@faultline/agent-capabilities";
import type { ExperimentResult } from "@faultline/core";
import { buildVisualWebMcpSurface } from "./agent-visual-surface.js";
import { buildExperimentWebMcpSurface } from "./experiment-webmcp-surface.js";
import { buildAgentReadSurface } from "./phase6-read-surface.js";
import type { WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpModelContext, WebMcpRegisterToolOptions, WebMcpTool } from "./types.js";
import { measureWebMcpTiming, type WebMcpTimingSink } from "./timing.js";
import type { VisualIntentHandler } from "./visual-intent.js";

export interface WebMcpRegistrationManifest {
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
  readonly signal: AbortSignal;
  readonly development?: boolean;
  readonly onVisualIntent?: VisualIntentHandler;
  readonly onExperimentResult?: (result: ExperimentResult) => void;
  readonly timing?: WebMcpTimingSink;
}

export interface RegisterAgentWebMcpSurfaceResult {
  readonly resolvedToolNames: readonly string[];
  readonly registeredToolNames: readonly string[];
  readonly failedToolNames: readonly string[];
  readonly readToolNames: readonly string[];
  readonly visualToolNames: readonly string[];
  readonly experimentToolNames: readonly string[];
  readonly manifest?: WebMcpRegistrationManifest;
}

function abortedResult(): RegisterAgentWebMcpSurfaceResult {
  return { resolvedToolNames: [], registeredToolNames: [], failedToolNames: [], readToolNames: [], visualToolNames: [], experimentToolNames: [] };
}

function fingerprintManifest(tools: readonly WebMcpTool[]): string {
  return JSON.stringify(tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations ?? null })));
}

/** Build one coherent manifest from one prepared context, then register in manifest order. */
export async function registerAgentWebMcpSurface(options: RegisterAgentWebMcpSurfaceOptions): Promise<RegisterAgentWebMcpSurfaceResult> {
  const { modelContext, registry, getContext, signal, development = false, onVisualIntent, onExperimentResult, timing } = options;
  const startedAt = performance.now();
  if (signal.aborted) return abortedResult();
  const context = resolveLiveAgentSnapshot(await getContext()).context;
  if (signal.aborted) return abortedResult();
  const [read, visual, experiment] = await Promise.all([
    measureWebMcpTiming(timing, "surface_build_ms", () => buildAgentReadSurface({ registry, getContext, context, development, timing }), { mode: "read" }),
    measureWebMcpTiming(timing, "surface_build_ms", () => buildVisualWebMcpSurface({ registry, getContext, context, development, timing, ...(onVisualIntent ? { onVisualIntent } : {}) }), { mode: "visual" }),
    measureWebMcpTiming(timing, "surface_build_ms", () => buildExperimentWebMcpSurface({ registry, getContext, context, development, timing, ...(onExperimentResult ? { onExperimentResult } : {}) }), { mode: "experiment" }),
  ]);
  if (signal.aborted) return abortedResult();
  const tools = [...read.tools, ...visual.tools, ...experiment.tools];
  const namesByMode = { read: read.tools.map(({ name }) => name), visual: visual.tools.map(({ name }) => name), experiment: experiment.tools.map(({ name }) => name) } as const;
  const manifest: WebMcpRegistrationManifest = {
    revision: context.evidenceMeta?.architectureRevision ?? "unversioned",
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
    if (result.status === "failed") failedToolNames.push(name);
  }
  timing?.({ kind: "timing", name: "registration_total_ms", durationMs: performance.now() - startedAt });
  return {
    resolvedToolNames: [...read.resolvedNames, ...visual.resolvedNames, ...experiment.resolvedNames],
    registeredToolNames,
    failedToolNames,
    readToolNames: registeredToolNames.filter((name) => namesByMode.read.includes(name)),
    visualToolNames: registeredToolNames.filter((name) => namesByMode.visual.includes(name)),
    experimentToolNames: registeredToolNames.filter((name) => namesByMode.experiment.includes(name)),
    manifest,
  };
}
