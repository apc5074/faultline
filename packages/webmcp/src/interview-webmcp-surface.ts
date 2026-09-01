import type {
  AgentCapability,
  AgentCapabilityRegistry,
  AgentContext,
  CapabilityResult,
  InterviewService,
  PresentationCue,
} from "@faultline/agent-capabilities";
import { INTERVIEW_CAPABILITY_NAMES, resolveLiveAgentSnapshot } from "@faultline/agent-capabilities";

import { toWebMcpTool } from "./to-webmcp-tool.js";
import type { WebMcpContextFactory } from "./to-webmcp-tool.js";
import type { WebMcpTool } from "./types.js";
import type { WebMcpTimingSink, WebMcpTraceSink } from "./timing.js";

export interface BuildInterviewWebMcpSurfaceOptions {
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  readonly interviewService?: InterviewService;
  readonly getCurrentEvidenceRevision?: () => string;
  readonly development?: boolean;
  readonly onPresentationCue?: (cue: PresentationCue) => void;
  readonly timing?: WebMcpTimingSink;
  readonly trace?: WebMcpTraceSink;
  readonly context?: AgentContext;
}

export interface InterviewWebMcpSurface {
  readonly tools: readonly WebMcpTool[];
  readonly skipped: readonly string[];
  readonly resolvedNames: readonly string[];
}

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

/** Dedicated browser session surface; never included in read/visual/experiment surfaces. */
export async function buildInterviewWebMcpSurface(options: BuildInterviewWebMcpSurfaceOptions): Promise<InterviewWebMcpSurface> {
  const context = options.context ?? resolveLiveAgentSnapshot(await options.getContext()).context;
  if (!options.interviewService) return { tools: [], skipped: [...INTERVIEW_CAPABILITY_NAMES], resolvedNames: [] };

  const tools: WebMcpTool[] = [];
  const skipped: string[] = [];
  for (const name of INTERVIEW_CAPABILITY_NAMES) {
    if (!options.registry.has(name)) {
      skipped.push(name);
      continue;
    }
    const capability = options.registry.get(name) as RegisteredCapability;
    if ((name !== "get_design_interview" && capability.mode !== "session") || !capability.availableWhen(context)) {
      skipped.push(name);
      continue;
    }
    tools.push(toWebMcpTool(capability, {
      registry: options.registry,
      getContext: options.getContext,
      getCurrentEvidenceRevision: options.getCurrentEvidenceRevision,
      availableToolNames: new Set(INTERVIEW_CAPABILITY_NAMES),
      interviewService: options.interviewService,
      development: options.development,
      ...(options.onPresentationCue ? { onPresentationCue: options.onPresentationCue } : {}),
      timing: options.timing,
      trace: options.trace,
      traceGroup: "stable-interview",
    }));
  }
  return { tools, skipped, resolvedNames: tools.map((tool) => tool.name) };
}
