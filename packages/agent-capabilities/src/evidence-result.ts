import type { AgentContext, EvidenceMeta } from "./context.js";

/** Adapter-neutral WebMCP evidence result contract (WMP-016). */
export const WMP_EVIDENCE_CONTRACT_VERSION = "wmp-2" as const;

export type EvidenceProvenanceSource =
  | "live_draft_projection"
  | "player_run"
  | "simulated_experiment";

export interface ActiveToolSuggestion {
  readonly name: string;
  readonly reason: string;
}

export interface AgentEvidenceState {
  readonly evidenceRevision: string;
  readonly sessionRevision: number;
  readonly surfaceRevision: string;
  readonly resultDigest: string;
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
  readonly next?: readonly ActiveToolSuggestion[];
  readonly truncated?: { readonly sections: readonly string[] };
}

export interface KnownStateInput {
  readonly evidenceRevision: string;
  readonly sessionRevision: number;
  readonly surfaceRevision: string;
  readonly resultDigest: string;
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

export function createScopedEntityReference(
  kind: EntityKind,
  entityId: string,
  evidenceRevision: string,
): ScopedEntityReference {
  const ref = `wmp-ent-${evidenceDigest(JSON.stringify({ kind, entityId, evidenceRevision, contract: WMP_EVIDENCE_CONTRACT_VERSION }))}`;
  return { ref, kind, entityId, evidenceRevision };
}

export function parseScopedEntityReference(value: string): ScopedEntityReference | undefined {
  if (!value.startsWith("wmp-ent-")) return undefined;
  return undefined;
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
  mode: "read" | "visual" | "experiment",
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
  next?: readonly ActiveToolSuggestion[],
  truncated?: { readonly sections: readonly string[] },
): AgentEvidenceResult<T> {
  return {
    contractVersion: WMP_EVIDENCE_CONTRACT_VERSION,
    state: { ...state, resultDigest: computeResultDigest(data) },
    provenance,
    data,
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
    typeof provenance.simulatorVersion === "string" &&
    typeof provenance.stale === "boolean" &&
    ["live_draft_projection", "player_run", "simulated_experiment"].includes(provenance.source)
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
