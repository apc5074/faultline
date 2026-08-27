/**
 * LP-05 — map simulator absorb / path RPS to canvas busyness (share of redirects).
 *
 * Visual load follows global path share, not local utilization. Affinity ceilings
 * and byRole tables are never read here — only measured sim metrics + redirect RPS.
 */

import type {
  CachePlacementEvidence,
  CacheResult,
  HotKeyScenarioResult,
  PostgresCapacityMetrics,
  ServiceCapacityMetrics,
} from "@faultline/simulator";

/** Near-zero share stays visually idle (no one-cell floor). */
export const VOLUME_SHARE_IDLE_EPSILON = 0.005;

export type ComponentVolumeShare = {
  componentId: string;
  /** Absorb or handled RPS used for the share (redirect-path teaching). */
  absorbRps: number;
  /** absorbRps / redirectRps, clamped to 0..1. */
  share01: number;
  /** Soft-curved share for glyph/edge fill (sqrt). Saturated forces 1. */
  visualLoad: number;
  saturated: boolean;
  kind: "cache" | "service" | "postgres";
};

export type VolumeShareSimulation = {
  caches?: Readonly<Record<string, CacheResult & Partial<CachePlacementEvidence>>>;
  services?: Readonly<Record<string, ServiceCapacityMetrics>>;
  postgres?: Readonly<Record<string, PostgresCapacityMetrics>>;
  hotKey?: HotKeyScenarioResult;
};

export type BuildVolumeSharesInput = {
  redirectRps: number;
  simulation: VolumeShareSimulation;
  /**
   * Optional Level Profile volume rules. Reserved for playtest asserts /
   * teaching docs — mapper does not invent hit rates from bands.
   */
  volumeProfile?: unknown;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** share01 = absorb / redirectRps (clamped). */
export function share01FromAbsorb(absorbRps: number, redirectRps: number): number {
  if (redirectRps <= 0 || absorbRps <= 0) return 0;
  return clamp01(absorbRps / redirectRps);
}

/**
 * Soft curve so modest shares do not light most glyph cells.
 * Saturation still fills the glyph completely (warning state).
 */
export function visualLoadFromShare(share01: number, saturated: boolean): number {
  if (saturated) return 1;
  const share = clamp01(share01);
  if (share <= VOLUME_SHARE_IDLE_EPSILON) return 0;
  return Math.sqrt(share);
}

/**
 * Cell/bay count from global share. Idle share → 0 cells (no max(1, …) floor).
 * Saturation still fills all slots.
 */
export function mechanismCellsFromShare(
  share01: number,
  slots: number,
  saturated: boolean,
): number {
  const capacity = Math.max(1, slots);
  if (saturated) return capacity;
  const load = visualLoadFromShare(share01, false);
  if (load <= 0) return 0;
  return Math.min(capacity, Math.ceil(load * capacity));
}

/** Edge stroke weight from connection RPS as a share of redirects. */
export function edgePlaybackWeightFromRps(rps: number, redirectRps: number): number {
  return visualLoadFromShare(share01FromAbsorb(rps, redirectRps), false);
}

function hotKeyAbsorbForComponent(
  componentId: string,
  hotKey: HotKeyScenarioResult | undefined,
): number {
  if (!hotKey?.active) return 0;
  const hop = hotKey.hops.find((entry) => entry.componentId === componentId);
  return hop?.absorbedViralRps ?? 0;
}

/**
 * Optional presentation blend: when hot-key is active, data_cache visuals may
 * emphasize viral absorb from sim hops (never invents hit rates from affinity).
 */
function cacheAbsorbRps(
  componentId: string,
  cache: CacheResult,
  hotKey: HotKeyScenarioResult | undefined,
): number {
  const baseline = Math.max(0, cache.hitRps);
  const viral = hotKeyAbsorbForComponent(componentId, hotKey);
  // Hot-key beat: emphasize sim viral absorb when present (never invents from affinity).
  return Math.max(baseline, viral);
}

/** Pure mapper: per-component share of challenge redirect RPS. */
export function buildComponentVolumeShares(input: BuildVolumeSharesInput): Map<string, ComponentVolumeShare> {
  const { redirectRps, simulation } = input;
  const shares = new Map<string, ComponentVolumeShare>();

  for (const [componentId, cache] of Object.entries(simulation.caches ?? {})) {
    const absorbRps = cacheAbsorbRps(componentId, cache, simulation.hotKey);
    const share01 = share01FromAbsorb(absorbRps, redirectRps);
    shares.set(componentId, {
      componentId,
      absorbRps,
      share01,
      visualLoad: visualLoadFromShare(share01, cache.saturated),
      saturated: cache.saturated,
      kind: "cache",
    });
  }

  for (const [componentId, service] of Object.entries(simulation.services ?? {})) {
    const absorbRps = Math.max(0, service.incomingRps);
    const share01 = share01FromAbsorb(absorbRps, redirectRps);
    const saturated = service.state === "saturated" || service.state === "critical";
    shares.set(componentId, {
      componentId,
      absorbRps,
      share01,
      visualLoad: visualLoadFromShare(share01, saturated),
      saturated,
      kind: "service",
    });
  }

  for (const [componentId, store] of Object.entries(simulation.postgres ?? {})) {
    // Redirect-path teaching: prefer read handled RPS (writes are a separate story).
    const absorbRps = Math.max(0, store.readHandledRps);
    const share01 = share01FromAbsorb(absorbRps, redirectRps);
    const saturated = store.state === "saturated" || store.state === "critical";
    shares.set(componentId, {
      componentId,
      absorbRps,
      share01,
      visualLoad: visualLoadFromShare(share01, saturated),
      saturated,
      kind: "postgres",
    });
  }

  return shares;
}

export function volumeShareMapToRecord(
  shares: ReadonlyMap<string, ComponentVolumeShare>,
): Record<string, number> {
  const record: Record<string, number> = {};
  for (const [id, share] of shares) {
    record[id] = share.share01;
  }
  return record;
}
