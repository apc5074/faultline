/**
 * VIS-002 — aggregate edge token rates from authoritative traffic_routed events.
 *
 * Simulator already emits post-absorb miss/forward RPS and write pierce RPS on
 * edges. This mapper turns those into deterministic spawn cadence — never
 * affinity ceilings or random cache theater.
 */

export type TrafficRoutedLike = {
  type: string;
  connectionId?: string;
  data: Readonly<Record<string, number | string>>;
};

/** Per-connection RPS after absorb (forward/miss) plus write pierce. */
export type AuthoritativeEdgeRate = {
  connectionId: string;
  /** Request RPS or read RPS continuing past absorb. */
  forwardRps: number;
  /** Write RPS that always pierces caches. */
  writeRps: number;
};

export type AuthoritativeTrafficPlan = {
  rates: ReadonlyMap<string, AuthoritativeEdgeRate>;
  redirectRps: number;
  /** Simulator-effective participation per component (0..1) for live visual cadence. */
  componentActivityRates?: ReadonlyMap<string, number>;
  /** Optional root lanes; downstream lanes are reached by chained packets. */
  spawnLaneKeys?: ReadonlySet<string>;
};

export type AuthoritativeSpawn = {
  connectionId: string;
  shape: "request" | "write";
};

/** Soft global cap so high RPS stays labeled, not infinitely tokenized. */
export const AUTHORITATIVE_MAX_PACKETS = 28;
/** Slots reserved so write pierce remains visible under request load. */
export const AUTHORITATIVE_WRITE_RESERVED = 4;
/** Max new tokens created on a single tick. */
export const AUTHORITATIVE_MAX_SPAWNS_PER_TICK = 4;
/**
 * Accrual scale: at full redirect RPS an edge earns ~1 token every
 * `AUTHORITATIVE_FULL_RPS_INTERVAL_TICKS` ticks (before concurrency cap).
 */
export const AUTHORITATIVE_FULL_RPS_INTERVAL_TICKS = 10;
/**
 * Any live lane (including small write pierce RPS) earns at least one token
 * about every N ticks so pierce never disappears under the visual cap.
 */
export const AUTHORITATIVE_MIN_LANE_INTERVAL_TICKS = 48;

function numberField(data: Readonly<Record<string, number | string>>, key: string): number {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Collapse traffic_routed events into per-connection forward vs write RPS.
 * Downstream of caches already carries miss (+ write); ingest edges carry demand.
 */
export function edgeRatesFromTrafficEvents(
  events: readonly TrafficRoutedLike[] | undefined,
): Map<string, AuthoritativeEdgeRate> {
  const rates = new Map<string, AuthoritativeEdgeRate>();
  if (!events) return rates;

  for (const event of events) {
    if (event.type !== "traffic_routed" || !event.connectionId) continue;
    const connectionId = event.connectionId;
    const direct = numberField(event.data, "requestsPerSecond");
    const read = numberField(event.data, "readRequestsPerSecond");
    const write = numberField(event.data, "writeRequestsPerSecond");
    const forward = direct > 0 ? direct : read;
    if (forward <= 0 && write <= 0) continue;

    const existing = rates.get(connectionId);
    if (!existing) {
      rates.set(connectionId, { connectionId, forwardRps: forward, writeRps: write });
      continue;
    }
    rates.set(connectionId, {
      connectionId,
      forwardRps: existing.forwardRps + forward,
      writeRps: existing.writeRps + write,
    });
  }

  return rates;
}

export function totalRps(rate: AuthoritativeEdgeRate): number {
  return Math.max(0, rate.forwardRps) + Math.max(0, rate.writeRps);
}

/** Accrual per tick for an RPS lane (monotonic in RPS above the visibility floor). */
export function spawnAccrualPerTick(rps: number, redirectRps: number): number {
  if (rps <= 0 || redirectRps <= 0) return 0;
  const share = Math.min(1, rps / redirectRps);
  const proportional = share / AUTHORITATIVE_FULL_RPS_INTERVAL_TICKS;
  const floor = 1 / AUTHORITATIVE_MIN_LANE_INTERVAL_TICKS;
  return Math.max(proportional, floor);
}

function laneKey(connectionId: string, shape: "request" | "write"): string {
  return `${connectionId}:${shape}`;
}

/**
 * Advance per-lane accumulators and emit capped deterministic spawns.
 * Accumulators persist across ticks (mutate a reusable Map).
 * Write lanes are drained before request lanes so pierce traffic stays visible
 * under the global visual cap.
 */
export function advanceAuthoritativeSpawns(
  plan: AuthoritativeTrafficPlan,
  accumulators: Map<string, number>,
  packetCounts: { total: number; writes: number } | number,
): AuthoritativeSpawn[] {
  const total = typeof packetCounts === "number" ? packetCounts : packetCounts.total;
  const writes = typeof packetCounts === "number" ? 0 : packetCounts.writes;
  const spawns: AuthoritativeSpawn[] = [];
  let remainingSlots = Math.max(0, AUTHORITATIVE_MAX_PACKETS - total);
  if (remainingSlots <= 0) return spawns;

  const ordered = [...plan.rates.values()].sort((a, b) => a.connectionId.localeCompare(b.connectionId));

  const drain = (shape: "request" | "write", slotBudget: number) => {
    let budget = Math.min(slotBudget, AUTHORITATIVE_MAX_SPAWNS_PER_TICK - spawns.length, remainingSlots);
    if (budget <= 0) return;

    for (const rate of ordered) {
      if (budget <= 0 || remainingSlots <= 0) return;
      const rps = shape === "write" ? rate.writeRps : rate.forwardRps;
      if (plan.spawnLaneKeys && !plan.spawnLaneKeys.has(laneKey(rate.connectionId, shape))) continue;
      if (rps <= 0) continue;

      const key = laneKey(rate.connectionId, shape);
      const next = (accumulators.get(key) ?? 0) + spawnAccrualPerTick(rps, plan.redirectRps);
      if (next < 1) {
        accumulators.set(key, next);
        continue;
      }

      const whole = Math.min(Math.floor(next), budget, remainingSlots);
      accumulators.set(key, next - whole);
      for (let i = 0; i < whole; i += 1) {
        spawns.push({ connectionId: rate.connectionId, shape });
        remainingSlots -= 1;
        budget -= 1;
      }
    }
  };

  drain("write", remainingSlots);
  const requestBudget = Math.max(
    0,
    Math.min(remainingSlots, AUTHORITATIVE_MAX_PACKETS - AUTHORITATIVE_WRITE_RESERVED - (total - writes)),
  );
  drain("request", requestBudget);
  return spawns;
}
