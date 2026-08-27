import type {
  ArchitecturalRoleId,
  ChallengeDefinition,
  ComponentInstance,
  WorkloadMechanismId,
} from "@faultline/core";
import type {
  CacheResult,
  MechanismPlacementEvidence,
  PostgresCapacityMetrics,
  ServiceCapacityMetrics,
} from "@faultline/simulator";

type CacheMetrics = CacheResult & {
  role: ArchitecturalRoleId;
  mechanismId: WorkloadMechanismId;
  challengeCeiling: number;
  playerIntent: number;
  effectiveConfiguredHitRate: number;
};

export type WorkloadEvidenceRow = {
  label: string;
  value: string;
  tone?: "neutral" | "inform" | "emphasis";
};

export type WorkloadEvidencePanel = {
  rows: readonly WorkloadEvidenceRow[];
  hint?: string;
};

const ROLE_LABELS: Record<ArchitecturalRoleId, string> = {
  edge_ingress: "Edge ingress — first hop on the request path",
  path_middleware: "Path middleware — on path, not in the primary role",
  compute: "Compute — handling API work",
  read_aside: "Read-aside — beside the store on read path",
  write_path: "Write path — only writes pass through",
  geo_route: "Geo routing — steering traffic across regions",
  primary_store: "Primary store — durable reads and writes",
  replica_store: "Read replica — read scaling only",
  unreachable: "Unreachable — not on the active path",
  misplaced: "Misplaced — connected, wrong pattern for this workload",
};

const MECHANISM_LABELS: Record<WorkloadMechanismId, string> = {
  edge_cache: "Edge cache — absorbs redirects before origin",
  data_cache: "Data cache — hot keys beside the store",
  request_fanout: "Request fan-out — spreads load across upstreams",
  geo_routing: "Geo routing — routes users toward nearby capacity",
  stateless_compute: "Stateless compute — API processing",
  durable_store: "Row store — durable link lookups",
};

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 1000) / 10}%`;
}

function formatRps(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} rps`;
}

function participationRow(
  handledRps: number,
  placement?: MechanismPlacementEvidence,
): WorkloadEvidenceRow {
  if (placement?.participation === "idle" || handledRps <= 0) {
    return {
      label: "Participation",
      value: "Idle · not handling active workload traffic",
      tone: "inform",
    };
  }
  return {
    label: "Participation",
    value: `Active · ${formatRps(handledRps)} handled`,
    tone: "emphasis",
  };
}

function placementRows(
  challenge: ChallengeDefinition,
  role: ArchitecturalRoleId | undefined,
  mechanismId: WorkloadMechanismId | undefined,
  placement: MechanismPlacementEvidence | undefined,
  cache: CacheMetrics | undefined,
): WorkloadEvidenceRow[] {
  const rows: WorkloadEvidenceRow[] = [];
  const resolvedRole = role ?? cache?.role;
  const resolvedMechanism = mechanismId ?? cache?.mechanismId;

  if (resolvedRole) {
    rows.push({
      label: "Architectural role",
      value: ROLE_LABELS[resolvedRole] ?? resolvedRole,
    });
  }

  if (resolvedMechanism) {
    const affinity = challenge.workloadAffinity?.mechanisms[resolvedMechanism];
    rows.push({
      label: "Mechanism",
      value: MECHANISM_LABELS[resolvedMechanism] ?? resolvedMechanism,
    });
    if (affinity?.note) {
      rows.push({ label: "Challenge note", value: affinity.note, tone: "inform" });
    }
  }

  const showCeiling =
    challenge.workloadAffinity !== undefined &&
    (placement?.participation === "active" || (cache && cache.hitRps > 0));

  if (showCeiling && cache) {
    rows.push({
      label: "Challenge ceiling (after role)",
      value: formatPercent(cache.challengeCeiling),
    });
    rows.push({
      label: "Player intent (dials)",
      value: formatPercent(cache.playerIntent),
    });
    rows.push({
      label: "Effective benefit",
      value: `${formatPercent(cache.effectiveConfiguredHitRate)} configured hit rate · ${formatPercent(cache.hitRate)} realized`,
      tone: "emphasis",
    });
  } else if (showCeiling && placement) {
    rows.push({
      label: "Challenge ceiling (after role)",
      value: formatPercent(placement.challengeCeiling),
    });
    rows.push({
      label: "Effective fit",
      value: formatPercent(placement.effective),
    });
    if (placement.unitCostPressure > 1) {
      rows.push({
        label: "Unit cost pressure",
        value: `${placement.unitCostPressure.toFixed(2)}× on handled work`,
      });
    }
    if (placement.processingLatencyPenaltyMs > 0) {
      rows.push({
        label: "Latency penalty",
        value: `+${Math.round(placement.processingLatencyPenaltyMs)} ms while active`,
      });
    }
  }

  return rows;
}

function cacheEvidence(
  component: ComponentInstance,
  cache: CacheMetrics,
  challenge: ChallengeDefinition,
): WorkloadEvidencePanel {
  const handled = cache.hitRps + cache.missRps;
  return {
    rows: [
      participationRow(cache.hitRps > 0 ? cache.hitRps : handled > 0 ? handled : 0, undefined),
      ...placementRows(challenge, cache.role, cache.mechanismId, undefined, cache),
      {
        label: "Path share (reads)",
        value: `${formatRps(cache.hitRps)} absorbed · ${formatRps(cache.missRps)} continues downstream`,
        tone: cache.hitRps > 0 ? "emphasis" : "inform",
      },
    ],
    hint:
      cache.role === "misplaced" || cache.role === "unreachable"
        ? "This cache is not earning its configured hit rate on this workload — topology, not dial tuning, is the lever."
        : undefined,
  };
}

function serviceEvidence(
  metrics: ServiceCapacityMetrics,
  challenge: ChallengeDefinition,
): WorkloadEvidencePanel {
  return {
    rows: [
      participationRow(metrics.handledRps, metrics.placement),
      ...placementRows(challenge, metrics.placement?.role, metrics.placement?.mechanismId, metrics.placement, undefined),
      {
        label: "Capacity",
        value: `${formatRps(metrics.handledRps)} of ${formatRps(metrics.capacityRps)}`,
      },
    ],
  };
}

function postgresEvidence(
  metrics: PostgresCapacityMetrics,
  challenge: ChallengeDefinition,
): WorkloadEvidencePanel {
  const handled = metrics.readHandledRps + metrics.writeHandledRps;
  return {
    rows: [
      participationRow(handled, metrics.placement),
      ...placementRows(challenge, metrics.placement?.role, metrics.placement?.mechanismId, metrics.placement, undefined),
      {
        label: "Store throughput",
        value: `${formatRps(metrics.readHandledRps)} reads · ${formatRps(metrics.writeHandledRps)} writes`,
      },
    ],
  };
}

function passthroughEvidence(label: string, incomingRps: number): WorkloadEvidencePanel {
  return {
    rows: [
      incomingRps > 0
        ? { label: "Participation", value: `Active · ${formatRps(incomingRps)} forwarded`, tone: "emphasis" }
        : { label: "Participation", value: "Idle · no traffic routed yet", tone: "inform" },
      { label: "Mechanism", value: label },
    ],
  };
}

export function workloadBriefingPlacementHint(challenge: ChallengeDefinition): string | undefined {
  const edgeNote = challenge.workloadAffinity?.mechanisms.edge_cache?.note;
  const dataNote = challenge.workloadAffinity?.mechanisms.data_cache?.note;
  if (!edgeNote && !dataNote) return undefined;
  if (edgeNote && dataNote) {
    return `${edgeNote} ${dataNote}`.trim();
  }
  return edgeNote ?? dataNote;
}

export function buildWorkloadEvidencePanel(input: {
  component: ComponentInstance;
  challenge: ChallengeDefinition;
  caches?: Readonly<Record<string, CacheMetrics>>;
  services?: Readonly<Record<string, ServiceCapacityMetrics>>;
  postgres?: Readonly<Record<string, PostgresCapacityMetrics>>;
  traffic?: Readonly<Record<string, { incomingRps: number; outgoingRps: number }>>;
}): WorkloadEvidencePanel | null {
  const { component, challenge } = input;
  const cache = input.caches?.[component.id];
  if (cache) return cacheEvidence(component, cache, challenge);

  const service = input.services?.[component.id];
  if (service) return serviceEvidence(service, challenge);

  const store = input.postgres?.[component.id];
  if (store) return postgresEvidence(store, challenge);

  const traffic = input.traffic?.[component.id];
  if (component.type === "load-balancer") {
    return passthroughEvidence(MECHANISM_LABELS.request_fanout, traffic?.incomingRps ?? 0);
  }
  if (component.type === "global-router") {
    return passthroughEvidence(MECHANISM_LABELS.geo_routing, traffic?.incomingRps ?? 0);
  }

  return null;
}
