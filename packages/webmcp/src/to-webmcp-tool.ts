import type {
  AgentCapability,
  AgentCapabilityRegistry,
  AgentContext,
  CapabilityResult,
  ClearAnnotationsIntent,
  LiveAgentSnapshot,
  VisualAnnotationIntent,
} from "@faultline/agent-capabilities";
import type { ExperimentResult } from "@faultline/core";
import {
  capabilityCancelled,
  capabilityError,
  computeResultDigest,
  computeSurfaceRevision,
  isCapabilityCancelled,
  resolveLiveAgentSnapshot,
} from "@faultline/agent-capabilities";

import { toWebMcpAnnotations } from "./annotations.js";
import { wrapWebMcpEnvelope } from "./envelope.js";
import { sanitizeWebMcpCapabilityResult, unexpectedWebMcpCapabilityFailure } from "./error-safety.js";
import type { WebMcpEvidenceLease, WebMcpTool, WebMcpToolExecutionContext } from "./types.js";
import { publishVisualIntent, type VisualIntentHandler } from "./visual-intent.js";
import { measureWebMcpTiming, recordWebMcpTiming, serializedWebMcpBytes, type WebMcpTimingSink } from "./timing.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function computeSurfaceRevisionFromTools(names: ReadonlySet<string>): string {
  return computeSurfaceRevision([...names]);
}

const TOOL_TITLES: Readonly<Record<string, string>> = {
  review_current_design: "Review current design",
  expand_design_evidence: "Expand design evidence",
  inspect_design_entity: "Inspect design entity",
  inspect_component_option: "Inspect component option",
  compare_design_evidence: "Compare design evidence",
  get_architecture: "Get architecture",
  get_metrics: "Get metrics",
  get_cost_breakdown: "Get cost breakdown",
  inspect_cache: "Inspect cache",
  inspect_replication: "Inspect replication",
  inspect_regional_traffic: "Inspect regional traffic",
};

function titleFor(capability: RegisteredCapability): string {
  return TOOL_TITLES[capability.name] ?? capability.name.split(/[_-]/g).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function hasPlayerAuthoredContent(capabilityName: string): boolean {
  return new Set(["get_session_focus", "review_current_design", "inspect_design_entity", "inspect_component", "get_architecture", "get_cost_breakdown"]).has(capabilityName);
}

/** Keep host-facing metadata explicit and compact; the shared capability remains verbose for other adapters. */
function webMcpDescription(capability: RegisteredCapability): string {
  const metadata: Record<string, string> = {
    review_current_design: "When: begin a review. Returns: current focus, simulator evidence, and next reads. Side effect: none. Recovery: retry if evidence is superseded.",
    inspect_design_entity: "When: inspect one referenced entity. Returns: targeted simulator-grounded facts. Side effect: none. Recovery: refresh stale references.",
    inspect_component_option: "When: explain an unlocked catalog option. Returns: factual configuration and modeled behavior. Side effect: none. Recovery: unavailable types are rejected.",
    compare_design_evidence: "When: compare retained evidence. Returns: deterministic changes and provenance. Side effect: none. Recovery: retry when a baseline is unavailable.",
    expand_design_evidence: "When: deeper evidence is requested. Returns: up to two named evidence sections. Side effect: none. Recovery: refresh an expired review reference.",
  };
  if (metadata[capability.name]) return metadata[capability.name]!;
  if (capability.mode === "visual") return "When: add a coaching mark. Returns: validated visual intent. Side effect: ephemeral page annotation only. Recovery: retry current IDs.";
  if (capability.mode === "experiment") return "When: run one approved experiment. Requires: explicit human consent for this exact name. Returns: baseline, outcome, delta, and simulator events. Side effect: temporary simulation only. Recovery: approve this exact named experiment or retry current evidence.";
  return `When: request ${titleFor(capability).toLowerCase()}. Returns: simulator-grounded facts. Side effect: none. Recovery: retry current evidence.`;
}

export type WebMcpContextFactory = (signal?: AbortSignal) => AgentContext | LiveAgentSnapshot | Promise<AgentContext | LiveAgentSnapshot>;

export interface ToWebMcpToolOptions {
  readonly registry: AgentCapabilityRegistry;
  readonly getContext: WebMcpContextFactory;
  /** Return the current semantic evidence revision when the source can expose it. */
  readonly getCurrentEvidenceRevision?: () => string;
  readonly surfaceRevision?: string;
  /** Exact names in the active registered manifest, used to filter follow-up hints. */
  readonly availableToolNames?: ReadonlySet<string>;
  /** Log unexpected adapter failures locally in development only. */
  readonly development?: boolean;
  /** Apply visual coaching intents to the client session store before returning to the agent. */
  readonly onVisualIntent?: VisualIntentHandler;
  readonly onExperimentResult?: (result: ExperimentResult) => void;
  readonly timing?: WebMcpTimingSink;
}

/**
 * Adapt one semantic capability into a browser WebMCP tool. Domain execution
 * stays in AgentCapabilityRegistry; this layer only maps WebMCP tool fields.
 */
export function toWebMcpTool(capability: RegisteredCapability, options: ToWebMcpToolOptions): WebMcpTool {
  const { registry, getContext, getCurrentEvidenceRevision, surfaceRevision = "unversioned", availableToolNames, development = false, onVisualIntent, onExperimentResult, timing } = options;
  const annotations = toWebMcpAnnotations(capability.annotations);
  const publishedExperimentDigests = new Set<string>();

  const acquireLease = async (signal?: AbortSignal): Promise<WebMcpEvidenceLease> => {
    const snapshot = resolveLiveAgentSnapshot(await measureWebMcpTiming(timing, "context_snapshot_ms", () => getContext(signal)));
    const evidenceRevision = snapshot.context.evidenceMeta?.architectureRevision ?? "unversioned";
    return {
      snapshot,
      evidenceRevision,
      surfaceRevision,
      sessionRevision: snapshot.session.revision,
      isCurrent: () => getCurrentEvidenceRevision?.() === evidenceRevision || getCurrentEvidenceRevision === undefined,
    };
  };

  return {
    name: capability.name,
    title: titleFor(capability),
    description: webMcpDescription(capability),
    inputSchema: capability.inputSchema.jsonSchema,
    ...((annotations || hasPlayerAuthoredContent(capability.name)) ? { annotations: { ...annotations, ...(hasPlayerAuthoredContent(capability.name) ? { untrustedContentHint: true } : {}) } } : {}),
    execute: async (input: unknown, executionContext: WebMcpToolExecutionContext) => {
      const startedAt = performance.now();
      if (isCapabilityCancelled(executionContext.signal)) {
        return sanitizeWebMcpCapabilityResult(capabilityCancelled(), capability.name);
      }

      try {
        let attempt = 0;
        let sanitized: CapabilityResult<unknown>;
        let capabilityResult: CapabilityResult<unknown> = capabilityError("CANCELLED", "Not executed.");
        let experimentCanPublish = false;
        while (true) {
          const lease = await acquireLease(executionContext.signal);
          const { context, session } = lease.snapshot;
          if (isCapabilityCancelled(executionContext.signal)) {
            return sanitizeWebMcpCapabilityResult(capabilityCancelled(), capability.name);
          }

          if (!capability.availableWhen(context)) {
            return sanitizeWebMcpCapabilityResult(
              capabilityError("NOT_FOUND", `Capability "${capability.name}" is not available for the current architecture.`, {
                retryable: true,
                recoveryTool: "review_current_design",
              }),
              capability.name,
            );
          }

          const result = await measureWebMcpTiming(timing, "capability_execution_ms", () => registry.invoke(capability.name, context, input, {
            signal: executionContext.signal,
            session,
            surfaceRevision: availableToolNames ? computeSurfaceRevisionFromTools(availableToolNames) : surfaceRevision,
          }), { capability: capability.name, mode: capability.mode });
          sanitized = sanitizeWebMcpCapabilityResult(result, capability.name);
          const resultData = sanitized.ok && sanitized.data && typeof sanitized.data === "object"
            ? sanitized.data as Record<string, unknown>
            : undefined;
          if (resultData && availableToolNames && Array.isArray(resultData.suggestedNextTools)) {
            sanitized = {
              ok: true,
              data: {
                ...resultData,
                suggestedNextTools: resultData.suggestedNextTools.filter(
                  (suggestion: unknown) => typeof suggestion === "object" && suggestion !== null && "name" in suggestion && availableToolNames.has(String((suggestion as { name: unknown }).name)),
                ),
              },
            };
          }
          capabilityResult = sanitized;
          if (sanitized.ok) {
            sanitized = wrapWebMcpEnvelope(sanitized, context, {
              capabilityName: capability.name,
              mode: capability.mode,
              lease,
              availableToolNames,
              simulated: capabilityResult.ok && capability.mode === "experiment" && isRecord(capabilityResult.data) && capabilityResult.data.simulated === true,
            });
            experimentCanPublish = capability.mode === "experiment" && capabilityResult.ok && sanitized.ok;
          }
          if (!lease.isCurrent()) {
            if (capability.mode === "read" && attempt === 0) {
              attempt += 1;
              continue;
            }
            sanitized = sanitizeWebMcpCapabilityResult(
              capabilityError(
                "NOT_FOUND",
                "Current evidence was superseded by a newer architecture revision; retry the read.",
                {
                  retryable: capability.mode === "read",
                  currentEvidenceRevision: getCurrentEvidenceRevision?.(),
                },
              ),
              capability.name,
            );
          }
          attempt += 1;
          break;
        }
        recordWebMcpTiming(timing, { name: "result_bytes", bytes: serializedWebMcpBytes(sanitized), capability: capability.name });
        if (experimentCanPublish && capabilityResult.ok && onExperimentResult) {
          const data = capabilityResult.data as { simulated?: boolean };
          const digest = computeResultDigest(capabilityResult.data);
          if (data.simulated === true && !publishedExperimentDigests.has(digest)) {
            publishedExperimentDigests.add(digest);
            onExperimentResult(capabilityResult.data as ExperimentResult);
          }
        }
        if (capability.mode === "visual" && capabilityResult.ok && onVisualIntent) {
          publishVisualIntent(
            capability.name,
            input,
            capabilityResult as CapabilityResult<VisualAnnotationIntent | ClearAnnotationsIntent>,
            onVisualIntent,
          );
        }
        return sanitized;
      } catch (error) {
        if (isCapabilityCancelled(executionContext.signal)) {
          return sanitizeWebMcpCapabilityResult(capabilityCancelled(), capability.name);
        }
        return unexpectedWebMcpCapabilityFailure(capability.name, error, development);
      } finally {
        recordWebMcpTiming(timing, { name: "tool_callback_total_ms", durationMs: performance.now() - startedAt, capability: capability.name });
      }
    },
  };
}
