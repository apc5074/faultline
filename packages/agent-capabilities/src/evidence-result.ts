import type { AgentContext, EvidenceMeta } from "./context.js";
import { validatePresentationCue, type EvidenceSubjects, type PresentationCue } from "./presentation-cue.js";
import type { CompareDesignEvidenceInput, InspectDesignEntityInput, ReviewEvidenceSection } from "./schemas.js";
import { compareDesignEvidenceInputSchema, estimateCapacityInputSchema, expandDesignEvidenceInputSchema, inspectComponentInputSchema, inspectDesignEntityInputSchema, noInputSchema } from "./schemas.js";

/** Adapter-neutral WebMCP evidence result contract (WMP-016). */
export const WMP_EVIDENCE_CONTRACT_VERSION = "wmp-2" as const;

export type EvidenceProvenanceSource =
  | "live_draft_projection"
  | "player_run"
  | "simulated_experiment";

/** @deprecated Migration-only shape. New capability code should emit EvidenceContinuation. */
export interface ActiveToolSuggestion {
  readonly name: string;
  readonly reason: string;
}

export const EVIDENCE_CONTINUATION_CONTRACT_VERSION = "continuation-1" as const;
export const MAX_EVIDENCE_CONTINUATIONS = 3;

export type EvidenceContinuationReasonCode =
  | "inspect_subject"
  | "inspect_connection"
  | "trace_workload"
  | "explain_requirement"
  | "explain_capacity"
  | "inspect_cost_contributor"
  | "expand_review"
  | "compare_revision";

interface EvidenceContinuationBase {
  readonly contractVersion: typeof EVIDENCE_CONTINUATION_CONTRACT_VERSION;
  readonly reasonCode: EvidenceContinuationReasonCode;
  readonly evidenceRevision: string;
  readonly surfaceRevision: string;
  readonly targetRefs?: readonly ScopedEntityReference[];
  readonly reviewRef?: string;
}

export type EvidenceContinuation =
  | (EvidenceContinuationBase & { readonly capabilityName: "inspect_component"; readonly input: { readonly componentId: string }; readonly targetRefs: readonly [ScopedEntityReference] })
  | (EvidenceContinuationBase & { readonly capabilityName: "inspect_design_entity"; readonly input: Extract<InspectDesignEntityInput, { readonly kind: "component" | "connection" | "requirement" | "region" | "workload"; readonly ref: string }>; readonly targetRefs: readonly [ScopedEntityReference] })
  | (EvidenceContinuationBase & { readonly capabilityName: "estimate_capacity"; readonly input: { readonly componentId: string }; readonly targetRefs: readonly [ScopedEntityReference] })
  | (EvidenceContinuationBase & { readonly capabilityName: "expand_design_evidence"; readonly input: { readonly reviewRef: string; readonly sections: readonly ReviewEvidenceSection[] }; readonly reviewRef: string })
  | (EvidenceContinuationBase & { readonly capabilityName: "compare_design_evidence"; readonly input: CompareDesignEvidenceInput; readonly targetRefs?: readonly [ScopedEntityReference] })
  | (EvidenceContinuationBase & { readonly capabilityName: "get_metrics" | "get_cost_breakdown"; readonly input: undefined });

export type NextToolSuggestion = ActiveToolSuggestion | EvidenceContinuation;

export interface AgentEvidenceState {
  readonly evidenceRevision: string;
  readonly sessionRevision: number;
  readonly surfaceRevision: string;
  readonly resultDigest: string;
  /** Exact semantic request identity used for safe unchanged responses. */
  readonly requestFingerprint?: string;
}

export interface AgentEvidenceProvenance {
  readonly source: EvidenceProvenanceSource;
  readonly simulatorVersion: string;
  readonly stale: boolean;
}

export interface AgentEvidenceResult<T> {
  readonly contractVersion: typeof WMP_EVIDENCE_CONTRACT_VERSION;
  readonly state: AgentEvidenceState;
  readonly provenance: AgentEvidenceProvenance;
  readonly data: T;
  readonly subjects?: EvidenceSubjects;
  readonly presentation?: PresentationCue;
  readonly next?: readonly NextToolSuggestion[];
  readonly truncated?: { readonly sections: readonly string[] };
}

export interface KnownStateInput {
  readonly evidenceRevision: string;
  readonly sessionRevision: number;
  readonly surfaceRevision: string;
  readonly resultDigest: string;
  /** Optional during the migration window; required for unchanged responses. */
  readonly requestFingerprint?: string;
}

export interface RequestFingerprintInput {
  readonly capabilityName: string;
  readonly intent?: string;
  readonly target?: { readonly kind: string; readonly id: string };
  readonly evidenceRevision: string;
  readonly sessionRevision: number;
  readonly focus?: unknown;
  readonly surfaceRevision: string;
  readonly resultDigest: string;
}

/** Deterministic identity for one semantically scoped evidence request. */
export function computeRequestFingerprint(input: RequestFingerprintInput): string {
  return evidenceDigest(JSON.stringify({
    contract: WMP_EVIDENCE_CONTRACT_VERSION,
    capability: input.capabilityName,
    intent: input.intent ?? "auto",
    target: input.target ?? null,
    evidenceRevision: input.evidenceRevision,
    sessionRevision: input.sessionRevision,
    focus: input.focus ?? null,
    surfaceRevision: input.surfaceRevision,
    resultDigest: input.resultDigest,
  }));
}

export interface UnchangedEvidenceData {
  readonly unchanged: true;
}

export interface FocusDeltaEvidenceData {
  readonly focusOnly: true;
  readonly focus: unknown;
  readonly packet?: unknown;
}

export type EntityKind =
  | "component"
  | "connection"
  | "requirement"
  | "region"
  | "workload"
  | "scenario"
  | "experiment";

export interface ScopedEntityReference {
  readonly ref: string;
  readonly kind: EntityKind;
  readonly entityId: string;
  readonly evidenceRevision: string;
}

export interface QuantitativeValue {
  readonly value: number;
  readonly unit: string;
  readonly precision?: number;
  readonly status?: "pass" | "fail" | "unknown";
}

export interface TrustedFacts<T> {
  readonly facts: T;
  readonly playerAuthored?: Readonly<Record<string, unknown>>;
}

/** FNV-1a digest for compact revision-scoped references. */
export function evidenceDigest(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function computeSurfaceRevision(toolNames: readonly string[]): string {
  return evidenceDigest([...toolNames].sort().join("|"));
}

export function computeResultDigest(data: unknown): string {
  return evidenceDigest(JSON.stringify(data));
}

function isLegacyToolSuggestion(value: unknown): value is ActiveToolSuggestion {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === "string" && record.name.length > 0 && record.name.length <= 80 &&
    typeof record.reason === "string" && record.reason.length > 0 && record.reason.length <= 280;
}

function continuationSchemaFor(capabilityName: EvidenceContinuation["capabilityName"]) {
  switch (capabilityName) {
    case "inspect_component": return inspectComponentInputSchema;
    case "inspect_design_entity": return inspectDesignEntityInputSchema;
    case "estimate_capacity": return estimateCapacityInputSchema;
    case "expand_design_evidence": return expandDesignEvidenceInputSchema;
    case "compare_design_evidence": return compareDesignEvidenceInputSchema;
    case "get_metrics":
    case "get_cost_breakdown": return noInputSchema;
  }
}

function validateContinuationTargetRefs(
  refs: unknown,
  evidenceRevision: string,
): refs is readonly ScopedEntityReference[] {
  if (!Array.isArray(refs) || refs.length === 0 || refs.length > 3) return false;
  const seen = new Set<string>();
  return refs.every((value) => {
    if (typeof value !== "object" || value === null) return false;
    const ref = value as Record<string, unknown>;
    if (typeof ref.ref !== "string" || typeof ref.kind !== "string" || !["component", "connection", "requirement", "region", "workload", "scenario", "experiment"].includes(ref.kind) || typeof ref.entityId !== "string" ||
      ref.evidenceRevision !== evidenceRevision || ref.entityId.length === 0 || seen.has(ref.ref)) return false;
    if (!Object.prototype.hasOwnProperty.call(ref, "ref") || ref.ref !== createScopedEntityReference(ref.kind as EntityKind, ref.entityId, evidenceRevision).ref) return false;
    seen.add(ref.ref);
    return true;
  });
}

/** Validate one typed continuation without executing it or resolving a new target. */
export function validateEvidenceContinuation(
  value: unknown,
  evidenceRevision: string,
  surfaceRevision: string,
): value is EvidenceContinuation {
  if (typeof value !== "object" || value === null) return false;
  const continuation = value as Record<string, unknown>;
  const capabilityName = continuation.capabilityName;
  if (continuation.contractVersion !== EVIDENCE_CONTINUATION_CONTRACT_VERSION ||
    typeof capabilityName !== "string" ||
    !["inspect_component", "inspect_design_entity", "estimate_capacity", "expand_design_evidence", "compare_design_evidence", "get_metrics", "get_cost_breakdown"].includes(capabilityName) ||
    typeof continuation.reasonCode !== "string" ||
    !["inspect_subject", "inspect_connection", "trace_workload", "explain_requirement", "explain_capacity", "inspect_cost_contributor", "expand_review", "compare_revision"].includes(continuation.reasonCode) ||
    continuation.evidenceRevision !== evidenceRevision || continuation.surfaceRevision !== surfaceRevision) return false;

  const schema = continuationSchemaFor(capabilityName as EvidenceContinuation["capabilityName"]);
  if (!schema.safeParse(continuation.input).success) return false;
  if (continuation.reviewRef !== undefined && (typeof continuation.reviewRef !== "string" || !/^wmp-ref-[0-9a-f]+$/.test(continuation.reviewRef))) return false;
  if (continuation.targetRefs !== undefined && !validateContinuationTargetRefs(continuation.targetRefs, evidenceRevision)) return false;

  if (capabilityName === "inspect_component" || capabilityName === "estimate_capacity") {
    const refs = continuation.targetRefs;
    const input = continuation.input as Record<string, unknown>;
    return validateContinuationTargetRefs(refs, evidenceRevision) && refs.length === 1 &&
      refs[0]!.kind === "component" && input.componentId === refs[0]!.ref;
  }
  if (capabilityName === "inspect_design_entity") {
    const refs = continuation.targetRefs;
    const input = continuation.input as Record<string, unknown>;
    return validateContinuationTargetRefs(refs, evidenceRevision) && refs.length === 1 &&
      input.ref === refs[0]!.ref && input.kind === refs[0]!.kind;
  }
  if (capabilityName === "expand_design_evidence") {
    return typeof continuation.reviewRef === "string" &&
      (continuation.input as Record<string, unknown>).reviewRef === continuation.reviewRef;
  }
  if (capabilityName === "compare_design_evidence" && continuation.targetRefs !== undefined) {
    return (continuation.input as Record<string, unknown>).targetRef === continuation.targetRefs[0]?.ref;
  }
  return continuation.targetRefs === undefined && continuation.reviewRef === undefined;
}

export function createScopedEntityReference(
  kind: EntityKind,
  entityId: string,
  evidenceRevision: string,
): ScopedEntityReference {
  const ref = `wmp-ent-${evidenceDigest(JSON.stringify({ kind, entityId, evidenceRevision, contract: WMP_EVIDENCE_CONTRACT_VERSION }))}`;
  return { ref, kind, entityId, evidenceRevision };
}

/** Resolve a canonical ID or scoped reference against the current evidence revision. */
export function resolveEntityTarget(
  target: string,
  currentRevision: string,
  candidates: Readonly<Record<EntityKind, readonly string[]>>,
): { readonly kind: EntityKind; readonly entityId: string } | undefined {
  if (target.startsWith("wmp-ent-")) {
    for (const kind of Object.keys(candidates) as EntityKind[]) {
      for (const entityId of candidates[kind] ?? []) {
        const reference = createScopedEntityReference(kind, entityId, currentRevision);
        if (reference.ref === target) return { kind, entityId };
      }
    }
    return undefined;
  }
  for (const kind of Object.keys(candidates) as EntityKind[]) {
    if (candidates[kind]?.includes(target)) return { kind, entityId: target };
  }
  return undefined;
}

export function provenanceFromContext(
  context: AgentContext,
  mode: "read" | "visual" | "experiment" | "session",
  simulated = false,
): AgentEvidenceProvenance {
  const meta = context.evidenceMeta;
  const source: EvidenceProvenanceSource = simulated
    ? "simulated_experiment"
    : meta?.simulationRunId.startsWith("live-") === true
      ? "live_draft_projection"
      : "player_run";
  return {
    source,
    simulatorVersion: meta?.simulatorVersion ?? "unknown",
    stale: meta?.isStale === true,
  };
}

export function buildAgentEvidenceResult<T>(
  data: T,
  state: AgentEvidenceState,
  provenance: AgentEvidenceProvenance,
  next?: readonly NextToolSuggestion[],
  truncated?: { readonly sections: readonly string[] },
  presentation?: PresentationCue,
  resultDigest?: string,
  subjects?: EvidenceSubjects,
): AgentEvidenceResult<T> {
  return {
    contractVersion: WMP_EVIDENCE_CONTRACT_VERSION,
    state: { ...state, resultDigest: resultDigest ?? computeResultDigest(data) },
    provenance,
    data,
    ...(subjects ? { subjects } : {}),
    ...(presentation ? { presentation } : {}),
    ...(next && next.length > 0 ? { next } : {}),
    ...(truncated ? { truncated } : {}),
  };
}

export function buildUnchangedEvidenceResult(
  state: KnownStateInput,
  provenance: AgentEvidenceProvenance,
): AgentEvidenceResult<UnchangedEvidenceData> {
  return buildAgentEvidenceResult({ unchanged: true }, state, provenance, []);
}

export function buildFocusDeltaEvidenceResult(
  state: AgentEvidenceState,
  provenance: AgentEvidenceProvenance,
  focus: unknown,
  packet?: unknown,
): AgentEvidenceResult<FocusDeltaEvidenceData> {
  return buildAgentEvidenceResult(
    { focusOnly: true, focus, ...(packet !== undefined ? { packet } : {}) },
    state,
    provenance,
    [],
  );
}

export function knownStateMatches(
  known: KnownStateInput,
  current: KnownStateInput,
): boolean {
  return (
    typeof known.requestFingerprint === "string" &&
    typeof current.requestFingerprint === "string" &&
    known.requestFingerprint === current.requestFingerprint &&
    known.evidenceRevision === current.evidenceRevision &&
    known.sessionRevision === current.sessionRevision &&
    known.surfaceRevision === current.surfaceRevision &&
    known.resultDigest === current.resultDigest
  );
}

export function focusOnlyDelta(
  known: KnownStateInput,
  current: KnownStateInput,
): boolean {
  return (
    typeof known.requestFingerprint === "string" &&
    typeof current.requestFingerprint === "string" &&
    known.requestFingerprint !== current.requestFingerprint &&
    known.evidenceRevision === current.evidenceRevision &&
    known.surfaceRevision === current.surfaceRevision &&
    known.resultDigest === current.resultDigest &&
    known.sessionRevision !== current.sessionRevision
  );
}

/** Strip repeated provenance and envelope-owned fields from capability payload. */
export function stripEnvelopeSourceFields(data: Record<string, unknown>): Record<string, unknown> {
  const { evidence: _evidence, suggestedNextTools: _suggestions, ...rest } = data;
  return rest;
}

const METRIC_UNITS: Readonly<Record<string, string>> = {
  redirectP95Ms: "ms",
  startupP95LatencyMs: "ms",
  incomingRps: "rps",
  capacityRps: "rps",
  utilization: "ratio",
  effectiveUtilization: "ratio",
  headroom: "ratio",
  hitRate: "ratio",
  readUtilization: "ratio",
  writeUtilization: "ratio",
  monthlyTotal: "usd_per_month",
  monthlyCost: "usd_per_month",
  budget: "usd_per_month",
  remainingBudget: "usd_per_month",
  budgetMonthly: "usd_per_month",
  amount: "usd_per_month",
  actual: "ms",
  target: "ms",
  minimumHeadroom: "ratio",
  deadlineCompletionRatio: "ratio",
  deadlineMissRatio: "ratio",
  originReadBytesPerSecond: "bytes_per_second",
  requestedStartsPerSecond: "rps",
  cdnHitStartsPerSecond: "rps",
  originReadStartsPerSecond: "rps",
};

function roundForUnit(value: number, unit: string): number {
  if (unit === "ratio") return Math.round(value * 1000) / 1000;
  if (unit === "usd_per_month") return Math.round(value * 100) / 100;
  if (unit === "ms" || unit === "rps" || unit === "bytes_per_second") return Math.round(value * 10) / 10;
  return value;
}

function toQuantitative(key: string, value: number): QuantitativeValue {
  const unit = METRIC_UNITS[key] ?? "count";
  return { value: roundForUnit(value, unit), unit, precision: unit === "ratio" ? 3 : 1 };
}

/** Normalize known numeric fields to explicit unit-bearing values. */
export function projectQuantitativeEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(projectQuantitativeEvidence);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "number" && Number.isFinite(entry) && METRIC_UNITS[key]) {
      projected[key] = toQuantitative(key, entry);
    } else if (Array.isArray(entry)) {
      projected[key] = entry.map((item) => projectQuantitativeEvidence(item));
    } else if (typeof entry === "object" && entry !== null) {
      projected[key] = projectQuantitativeEvidence(entry);
    } else {
      projected[key] = entry;
    }
  }
  return projected;
}

/** Separate player-authored labels from authoritative simulator facts where applicable. */
export function separatePlayerAuthored(
  capabilityName: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (capabilityName === "inspect_design_entity" && data.kind === "component" && typeof data.config === "object" && data.config !== null) {
    const { config, ...facts } = data;
    return { facts: { ...facts, config }, playerAuthored: { note: "Component config values are player-authored." } };
  }
  if (capabilityName === "inspect_component" && typeof data.config === "object" && data.config !== null) {
    const { config, label, ...facts } = data;
    return {
      facts: { ...facts, config },
      ...(typeof label === "string" ? { playerAuthored: { label } } : {}),
    };
  }
  if (capabilityName === "get_architecture" && Array.isArray(data.components)) {
    return {
      facts: {
        inventory: data.inventory,
        components: data.components,
        connections: data.connections ?? [],
      },
      playerAuthored: {
        note: "Component config values are player-authored and may not match simulator semantics.",
      },
    };
  }
  if (capabilityName === "get_cost_breakdown" && Array.isArray(data.lineItems)) {
    return {
      ...data,
      lineItems: (data.lineItems as Array<Record<string, unknown>>).map((item) => {
        const { label, ...rest } = item;
        return {
          ...rest,
          ...(typeof label === "string" ? { playerAuthored: { label } } : {}),
        };
      }),
    };
  }
  return data;
}

export function isAgentEvidenceResult(value: unknown): value is AgentEvidenceResult<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.contractVersion === WMP_EVIDENCE_CONTRACT_VERSION &&
    typeof record.state === "object" &&
    record.state !== null &&
    typeof record.provenance === "object" &&
    record.provenance !== null &&
    "data" in record
  );
}

function validateNormalizedSubjects(value: unknown, evidenceRevision: string): value is EvidenceSubjects {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.evidenceRevision !== "string" || record.evidenceRevision !== evidenceRevision ||
    !["component", "path", "set", "failure", "comparison"].includes(record.relation as string) ||
    !Array.isArray(record.supporting) || !Array.isArray(record.connections)) return false;
  const entries = [record.primary, ...record.supporting, ...record.connections].filter((entry) => entry !== undefined);
  const refs = new Set<string>();
  let componentCount = 0;
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) return false;
    const target = entry as Record<string, unknown>;
    if (typeof target.ref !== "string" || typeof target.kind !== "string" || typeof target.entityId !== "string" ||
      target.evidenceRevision !== evidenceRevision || (target.emphasis !== "primary" && target.emphasis !== "secondary") || refs.has(target.ref)) return false;
    if (!(["component", "connection", "requirement", "workload", "region"] as string[]).includes(target.kind)) return false;
    if (target.ref !== createScopedEntityReference(target.kind as EntityKind, target.entityId, evidenceRevision).ref) return false;
    if (target.kind === "component") componentCount += 1;
    refs.add(target.ref);
  }
  if (record.relation === "path" && (componentCount > 5 || record.connections.length > 5)) return false;
  if (record.relation === "set" && (record.connections.length > 0 || entries.some((entry) => (entry as Record<string, unknown>).kind !== "component"))) return false;
  return record.primary !== undefined && (record.primary as Record<string, unknown>).emphasis === "primary";
}

export function validateAgentEvidenceResult(value: unknown): value is AgentEvidenceResult<unknown> {
  if (!isAgentEvidenceResult(value)) return false;
  const record = value as AgentEvidenceResult<unknown>;
  const state = record.state;
  const provenance = record.provenance;
  return (
    typeof state.evidenceRevision === "string" &&
    typeof state.sessionRevision === "number" &&
    typeof state.surfaceRevision === "string" &&
    typeof state.resultDigest === "string" &&
    (state.requestFingerprint === undefined || typeof state.requestFingerprint === "string") &&
    typeof provenance.simulatorVersion === "string" &&
    typeof provenance.stale === "boolean" &&
    ["live_draft_projection", "player_run", "simulated_experiment"].includes(provenance.source)
    && (record.presentation === undefined || validatePresentationCue(record.presentation, state.evidenceRevision))
    && (record.subjects === undefined || validateNormalizedSubjects(record.subjects, state.evidenceRevision))
    && (record.next === undefined || (Array.isArray(record.next) && record.next.length <= MAX_EVIDENCE_CONTINUATIONS && record.next.every((entry) => isLegacyToolSuggestion(entry) || validateEvidenceContinuation(entry, state.evidenceRevision, state.surfaceRevision))))
  );
}

export function reviewReferencePayload(
  context: AgentContext,
  intent = "auto",
  targetId?: string,
): string {
  return JSON.stringify({
    revision: context.evidenceMeta?.architectureRevision ?? "unversioned",
    packet: WMP_EVIDENCE_CONTRACT_VERSION,
    intent,
    target: targetId ?? "auto",
  });
}

export function reviewReference(
  context: AgentContext,
  intent = "auto",
  targetId?: string,
): string {
  return `wmp-ref-${evidenceDigest(reviewReferencePayload(context, intent, targetId))}`;
}

export function evidenceRevisionFromMeta(meta: EvidenceMeta | undefined): string {
  return meta?.architectureRevision ?? "unversioned";
}
