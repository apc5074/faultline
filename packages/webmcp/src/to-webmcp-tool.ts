import type {
  AgentCapability,
  AgentCapabilityRegistry,
  AgentContext,
  CapabilityResult,
  ClearAnnotationsIntent,
  InterviewService,
  LiveAgentSnapshot,
  PresentationCue,
  VisualAnnotationIntent,
} from "@faultline/agent-capabilities";
import type { Architecture } from "@faultline/core";
import {
  capabilityCancelled,
  capabilityError,
  computeResultDigest,
  computeSurfaceRevision,
  createComponentExplanationPresentation,
  isCapabilityCancelled,
  isMatchingVisualApplicationReceipt,
  resolveLiveAgentSnapshot,
  validatePresentationCue,
} from "@faultline/agent-capabilities";

import { toWebMcpAnnotations } from "./annotations.js";
import { wrapWebMcpEnvelope } from "./envelope.js";
import { sanitizeWebMcpCapabilityResult, unexpectedWebMcpCapabilityFailure } from "./error-safety.js";
import type { WebMcpEvidenceLease, WebMcpTool, WebMcpToolExecutionContext } from "./types.js";
import { publishVisualIntent, type VisualIntentHandler } from "./visual-intent.js";
import { COMPONENT_EXPLANATION_RENDER_DEADLINE_MS, type ComponentExplanationPresentationHandler } from "./component-explanation-presentation.js";
import { measureWebMcpTiming, recordWebMcpTiming, recordWebMcpTrace, serializedWebMcpBytes, type WebMcpTimingSink, type WebMcpTraceSink } from "./timing.js";

type RegisteredCapability = AgentCapability<AgentContext, unknown, CapabilityResult<unknown>>;

function interviewTraceFields(value: unknown): Pick<import("./timing.js").WebMcpTraceEvent, "interviewId" | "questionId" | "evaluationVerdict"> {
  if (!isRecord(value)) return {};
  const envelope = isRecord(value.data) ? value.data : undefined;
  const data = envelope && isRecord(envelope.data) ? envelope.data : envelope;
  if (!isRecord(data) || !isRecord(data.state)) return {};
  const state = data.state;
  const question = isRecord(state.currentQuestion) ? state.currentQuestion : undefined;
  const answers = Array.isArray(state.answers) ? state.answers : [];
  const answer = isRecord(answers[answers.length - 1]) ? answers[answers.length - 1] : undefined;
  return {
    ...(typeof state.interviewId === "string" ? { interviewId: state.interviewId } : {}),
    ...(typeof question?.questionId === "string" ? { questionId: question.questionId } : {}),
    ...(answer?.verdict === "correct" || answer?.verdict === "partial" || answer?.verdict === "incorrect" ? { evaluationVerdict: answer.verdict } : {}),
  };
}

function interviewTransition(name: string): "start" | "get" | "answer" | "follow_up" | "advance" | "prepare_review" | "submit_critique" | "end" | "restart" | undefined {
  if (name === "start_design_interview") return "start";
  if (name === "get_design_interview") return "get";
  if (name === "submit_interview_answer") return "answer";
  if (name === "follow_up_design_interview") return "follow_up";
  if (name === "advance_design_interview") return "advance";
  if (name === "end_design_interview") return "end";
  if (name === "restart_design_interview") return "restart";
  if (name === "prepare_interview_simulation_review") return "prepare_review";
  if (name === "submit_interview_simulation_critique") return "submit_critique";
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function computeSurfaceRevisionFromTools(names: ReadonlySet<string>): string {
  return computeSurfaceRevision([...names]);
}

const TOOL_TITLES: Readonly<Record<string, string>> = {
  review_current_design: "Review current design",
  start_design_interview: "Start design interview",
  get_design_interview: "Get design interview",
  submit_interview_answer: "Submit interview answer",
  follow_up_design_interview: "Ask interview follow-up",
  advance_design_interview: "Advance design interview",
  end_design_interview: "End design interview",
  restart_design_interview: "Restart design interview",
  prepare_interview_simulation_review: "Prepare simulation review",
  submit_interview_simulation_critique: "Submit simulation critique",
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
    review_current_design: "Use for overview, current UI focus, retained-revision delta, or genuine ambiguity. Targeted questions should use direct evidence tools first.",
    start_design_interview: "Call when the player asks to be interviewed. Starts or resumes the browser-owned session and returns one stable-ID question at a time; visually focuses the current component and groups stateless services.",
    get_design_interview: "Read the active browser-owned interview for its exact interview and question IDs. Does not advance or mutate the session.",
    submit_interview_answer: "Submit one evaluated answer for the current question. The session remains on this question so the player can ask follow-ups before advancing.",
    follow_up_design_interview: "Ask and answer a follow-up about the current question. Keeps the interview on the same question.",
    advance_design_interview: "Advance exactly one question after the player explicitly says they are ready. Requires ready: true and the current question ID.",
    end_design_interview: "End the active browser-owned interview. Does not change the architecture, official attempts, or leaderboard.",
    restart_design_interview: "Start a new interview on the current architecture while preserving the prior browser-scoped interview in history. Use only after the player explicitly asks to restart.",
    prepare_interview_simulation_review: "After the player says Review my redesign, evaluate the baseline and current canvas design under the fixed traffic×2 scenario. Returns bounded simulated evidence and a digest; does not edit the architecture or submit official results.",
    submit_interview_simulation_critique: "Save a concise critique grounded only in the current simulation review digest. Completes the coaching interview; never claims official pass/fail.",
    get_architecture: "Read the current architecture and inventory for board-wide contents, logical component counts, and connections. Use this for unqualified board questions; do not reuse after a board edit.",
    inspect_design_entity: "Use first for relationships/workloads. Input: { kind: \"connection\", endpoints: { source, target } } or { kind: \"workload\", selector: { scope: \"named\" | \"default\", channelId? } }. Frames valid paths.",
    inspect_component: "Read the current invocation revision. A single resolved current component is visibly focused before its evidence returns. Use { componentId } for one component, or { selector: { type: \"postgres\", scope: \"all\" | \"topmost\" } }; use scope all by default for type-wide/count/existence, topmost only when positional. Do not reuse after a board edit.",
    get_metrics: "Use first for health/metrics questions. Returns current simulator outcomes; targeted results frame valid evidence.",
    inspect_component_option: "When: explain an unlocked catalog option only. For a component already on the board, use inspect_component instead so the canvas can focus it. Returns: factual configuration and modeled behavior. Side effect: none.",
    compare_design_evidence: "When: compare retained evidence. Returns: deterministic changes and provenance. Side effect: none. Recovery: retry when a baseline is unavailable.",
    expand_design_evidence: "When: deeper evidence is requested. Returns: up to two named evidence sections. Side effect: none. Recovery: refresh an expired review reference.",
    focus_component: "Before answering, use only for an explicit persistent focus gesture; targeted reads already frame current components. Visually zooms to its exact current component ID.",
    highlight_connection: "Before answering, use only for an explicit persistent relationship mark; targeted reads already frame current paths. Persistent mark frames both endpoints using the exact current connection ID.",
    annotate_component: "Call only when a persistent grounded coaching note is useful. Adds a note without changing the architecture.",
    clear_annotations: "Call to remove prior agent coaching marks from the canvas.",
  };
  if (metadata[capability.name]) return metadata[capability.name]!;
  if (capability.mode === "visual") return "Apply one validated visual coaching action using current IDs. Does not change the architecture.";
  if (capability.mode === "session") return "Session operation for the current browser-owned interview. Does not edit architecture, submit attempts, or affect leaderboard state.";
  return `Current simulator facts; targeted results frame valid subjects. Retry stale evidence.`;
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
  /** Apply a grounded read-result presentation cue without changing selection or viewport. */
  readonly onPresentationCue?: (cue: PresentationCue) => void;
  /** Page-owned render receipt for mandatory direct-component explanation focus. */
  readonly onComponentExplanationPresentation?: ComponentExplanationPresentationHandler;
  /** Production direct-component reads must wait for their focus render receipt. */
  readonly requireComponentExplanationPresentation?: boolean;
  /** Host-owned camera focus for component explanation reads. */
  readonly onFocusComponent?: (componentId: string) => void;
  /** Browser-owned interview session port, available only on the interview surface. */
  readonly interviewService?: InterviewService;
  readonly timing?: WebMcpTimingSink;
  readonly trace?: WebMcpTraceSink;
  readonly traceGroup?: string;
  readonly traceGeneration?: number;
}

function componentExplanationTarget(
  capabilityName: string,
  data: unknown,
  input: unknown,
  architecture: Architecture,
): string | undefined {
  if (capabilityName === "inspect_component" && isRecord(data)) {
    if (typeof data.id === "string") return data.id;
    const selection = isRecord(data.selection) ? data.selection : undefined;
    const components = Array.isArray(data.components) ? data.components : undefined;
    if (selection?.matchedCount !== 1 || components?.length !== 1 || !isRecord(components[0]) || typeof components[0].id !== "string") return undefined;
    return components[0].id;
  }
  if (capabilityName === "inspect_component_option" && isRecord(input) && typeof input.type === "string") {
    const matches = architecture.components.filter((component) => component.type === input.type);
    if (matches.length === 1) return matches[0]!.id;
  }
  return undefined;
}

function focusAnnotationFromResult(result: CapabilityResult<unknown>): import("@faultline/agent-capabilities").AgentFocusAnnotation | undefined {
  if (!result.ok || !isRecord(result.data) || !isRecord(result.data.annotation)) return undefined;
  const annotation = result.data.annotation;
  return annotation.type === "focus" && typeof annotation.id === "string" && typeof annotation.componentId === "string"
    ? annotation as unknown as import("@faultline/agent-capabilities").AgentFocusAnnotation
    : undefined;
}

async function awaitPresentationReceiptPromise<T>(
  receiptPromise: Promise<import("@faultline/agent-capabilities").VisualApplicationReceipt>,
  command: import("@faultline/agent-capabilities").ComponentExplanationPresentation,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("render timeout")), COMPONENT_EXPLANATION_RENDER_DEADLINE_MS);
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    receiptPromise.then((receipt) => {
      if (!isMatchingVisualApplicationReceipt(command, receipt)) reject(new Error("render receipt rejected"));
      else resolve(receipt as T);
    }, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    });
  });
}

/**
 * Adapt one semantic capability into a browser WebMCP tool. Domain execution
 * stays in AgentCapabilityRegistry; this layer only maps WebMCP tool fields.
 */
export function toWebMcpTool(capability: RegisteredCapability, options: ToWebMcpToolOptions): WebMcpTool {
  const { registry, getContext, getCurrentEvidenceRevision, surfaceRevision = "unversioned", availableToolNames, development = false, onVisualIntent, onPresentationCue, onComponentExplanationPresentation, requireComponentExplanationPresentation = false, onFocusComponent, interviewService, timing, trace, traceGroup, traceGeneration } = options;
  const annotations = toWebMcpAnnotations(capability.annotations);

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
        const inputShape = isRecord(input) ? Object.keys(input).sort().slice(0, 8) : [];
        let attempt = 0;
        let sanitized: CapabilityResult<unknown>;
        let capabilityResult: CapabilityResult<unknown> = capabilityError("CANCELLED", "Not executed.");
        while (true) {
          const lease = await acquireLease(executionContext.signal);
          const selectorScope = isRecord(input) && isRecord(input.selector) && (input.selector.scope === "all" || input.selector.scope === "topmost") ? input.selector.scope : undefined;
          recordWebMcpTrace(trace, { name: "tool_invoked", capability: capability.name, ...(traceGroup ? { group: traceGroup } : {}), inputShape, ...(selectorScope ? { selectorScope } : {}), evidenceRevision: lease.evidenceRevision, ...(attempt > 0 ? { retried: true } : {}) });
          recordWebMcpTrace(trace, { name: "lease_acquired", capability: capability.name, evidenceRevision: lease.evidenceRevision });
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
            interviewService,
            surfaceRevision: availableToolNames ? computeSurfaceRevisionFromTools(availableToolNames) : surfaceRevision,
          }), { capability: capability.name, mode: capability.mode });
          let componentBarrierRendered = false;
          sanitized = sanitizeWebMcpCapabilityResult(result, capability.name);
          recordWebMcpTrace(trace, { name: "capability_completed", capability: capability.name, evidenceRevision: lease.evidenceRevision, ...(capability.mode === "session" ? { interviewTransition: interviewTransition(capability.name) } : {}), outcome: sanitized.ok ? "success" : sanitized.code === "CANCELLED" ? "cancelled" : "error", ...(sanitized.ok ? interviewTraceFields(sanitized) : {}), ...(sanitized.ok ? {} : { errorCode: sanitized.code }) });
          const resultData = sanitized.ok && sanitized.data && typeof sanitized.data === "object"
            ? sanitized.data as Record<string, unknown>
            : undefined;
          const matchedCount = resultData && isRecord(resultData.selection) && typeof resultData.selection.matchedCount === "number"
            ? resultData.selection.matchedCount
            : undefined;
          if (matchedCount !== undefined) {
            recordWebMcpTrace(trace, { name: "capability_completed", capability: capability.name, evidenceRevision: lease.evidenceRevision, ...(selectorScope ? { selectorScope } : {}), matchedCount, retried: attempt > 0, outcome: sanitized.ok ? "success" : "error" });
          }
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
          const componentId = sanitized.ok ? componentExplanationTarget(capability.name, sanitized.data, input, context.architecture) : undefined;
          if (componentId && requireComponentExplanationPresentation) {
            recordWebMcpTrace(trace, { name: "component_target_resolved", capability: capability.name, evidenceRevision: lease.evidenceRevision });
            if (!onComponentExplanationPresentation || !onVisualIntent) {
              sanitized = sanitizeWebMcpCapabilityResult(
                capabilityError("PRESENTATION_UNAVAILABLE", "Component focus is unavailable; retry this current-component read.", {
                  retryable: true,
                  currentEvidenceRevision: lease.evidenceRevision,
                  recoveryTool: "review_current_design",
                }),
                capability.name,
              );
            } else {
              const focusResult = await registry.invoke("focus_component", context, { componentId }, {
                signal: executionContext.signal,
                session,
                surfaceRevision: availableToolNames ? computeSurfaceRevisionFromTools(availableToolNames) : surfaceRevision,
              });
              const annotation = focusAnnotationFromResult(focusResult);
              if (!annotation) {
                sanitized = sanitizeWebMcpCapabilityResult(capabilityError("PRESENTATION_UNAVAILABLE", "Component focus could not be applied; retry this current-component read.", { retryable: true, currentEvidenceRevision: lease.evidenceRevision, recoveryTool: "review_current_design" }), capability.name);
              } else {
                const command = createComponentExplanationPresentation({
                  commandId: annotation.intentId ?? annotation.id,
                  componentId,
                  evidenceRevision: lease.evidenceRevision,
                  sessionRevision: session.revision,
                });
                recordWebMcpTrace(trace, { name: "visual_barrier_started", capability: capability.name, evidenceRevision: lease.evidenceRevision });
                onFocusComponent?.(componentId);
                const presentationReceipt = onComponentExplanationPresentation(command, { signal: executionContext.signal });
                publishVisualIntent("focus_component", { componentId }, focusResult as CapabilityResult<VisualAnnotationIntent>, onVisualIntent);
                recordWebMcpTrace(trace, { name: "focus_component_invoked", capability: capability.name, evidenceRevision: lease.evidenceRevision });
                try {
                  await awaitPresentationReceiptPromise(presentationReceipt, command, executionContext.signal);
                  if (!lease.isCurrent()) {
                    if (attempt === 0) { attempt += 1; continue; }
                    sanitized = sanitizeWebMcpCapabilityResult(capabilityError("NOT_FOUND", "Current evidence was superseded by a newer architecture revision; retry the read.", { retryable: true, currentEvidenceRevision: getCurrentEvidenceRevision?.() }), capability.name);
                  } else {
                    componentBarrierRendered = true;
                    recordWebMcpTrace(trace, { name: "visual_barrier_rendered", capability: capability.name, evidenceRevision: lease.evidenceRevision });
                  }
                } catch (error) {
                  sanitized = sanitizeWebMcpCapabilityResult(
                    isCapabilityCancelled(executionContext.signal) || (error instanceof DOMException && error.name === "AbortError")
                      ? capabilityCancelled()
                      : capabilityError("PRESENTATION_UNAVAILABLE", "Component focus was not rendered; retry this current-component read.", { retryable: true, currentEvidenceRevision: lease.evidenceRevision, recoveryTool: "review_current_design" }),
                    capability.name,
                  );
                }
              }
            }
          } else if (componentId) {
            onFocusComponent?.(componentId);
          }
          capabilityResult = sanitized;
          if (sanitized.ok) {
            sanitized = wrapWebMcpEnvelope(sanitized, context, {
              capabilityName: capability.name,
              mode: capability.mode,
              input,
              lease,
              availableToolNames,
            });
            if (componentBarrierRendered && sanitized.ok && isRecord(sanitized.data) && "presentation" in sanitized.data) {
              const { presentation: _duplicateFocusCue, ...withoutPresentation } = sanitized.data;
              sanitized = { ok: true, data: withoutPresentation };
            }
            if (componentBarrierRendered && sanitized.ok) {
              recordWebMcpTrace(trace, { name: "evidence_released", capability: capability.name, evidenceRevision: lease.evidenceRevision });
            }
          }
          if (!lease.isCurrent()) {
            if ((capability.mode === "read" || capability.mode === "session") && attempt === 0) {
              attempt += 1;
              continue;
            }
            sanitized = sanitizeWebMcpCapabilityResult(
              capabilityError(
                "NOT_FOUND",
                "Current evidence was superseded by a newer architecture revision; retry the read.",
                {
                  retryable: capability.mode === "read" || capability.mode === "session",
                  currentEvidenceRevision: getCurrentEvidenceRevision?.(),
                },
              ),
              capability.name,
            );
            recordWebMcpTrace(trace, { name: "capability_completed", capability: capability.name, outcome: "superseded", errorCode: "NOT_FOUND", evidenceRevision: lease.evidenceRevision });
          }
          if (sanitized.ok && sanitized.data && typeof sanitized.data === "object" && "presentation" in sanitized.data) {
            const cue = (sanitized.data as { presentation?: unknown }).presentation;
            if (cue) recordWebMcpTrace(trace, { name: "cue_derived", capability: capability.name, cueKind: (cue as { kind?: string }).kind === "path" ? "path" : (cue as { kind?: string }).kind === "set" ? "set" : "spotlight", targetCount: Array.isArray((cue as { targets?: unknown }).targets) ? (cue as { targets: unknown[] }).targets.length : 0, primaryKind: String(((cue as { targets?: Array<{ kind?: unknown }> }).targets ?? []).find((target) => target?.kind)?.kind ?? "unknown"), cameraIntent: String((cue as { camera?: unknown }).camera ?? "none") });
            if (cue && validatePresentationCue(cue, lease.evidenceRevision)) {
              // Presentation is advisory. A browser callback failure must not
              // prevent the current evidence envelope from reaching the host.
              try {
                onPresentationCue?.(cue as PresentationCue);
                if (capability.name === "inspect_component" || capability.name === "inspect_component_option") {
                  const primary = (cue as PresentationCue).targets.find((target) => target.kind === "component" && target.emphasis === "primary")
                    ?? (cue as PresentationCue).targets.find((target) => target.kind === "component");
                  if (primary?.kind === "component") onFocusComponent?.(primary.entityId);
                }
                if (onPresentationCue) recordWebMcpTrace(trace, { name: "cue_published", capability: capability.name, cueKind: cue.kind, targetCount: cue.targets.length, evidenceRevision: lease.evidenceRevision });
              } catch (error) {
                if (development) console.warn("WebMCP presentation callback failed", error);
              }
            } else if (cue) {
              recordWebMcpTrace(trace, { name: "cue_rejected", capability: capability.name, reason: "invalid_or_stale" });
            }
          }
          attempt += 1;
          break;
        }
        recordWebMcpTiming(timing, { name: "result_bytes", bytes: serializedWebMcpBytes(sanitized), capability: capability.name });
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
