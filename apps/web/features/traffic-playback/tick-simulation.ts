/**
 * Frame tick loop ported 1:1 from Implement Plan/src/simulation.ts (Figma reference).
 * Visual motion only — does not decide routing truth (simulator remains canonical).
 *
 * When an authoritative traffic plan is supplied (post-Run evidence), ambient
 * user injection and random cache/CDN theater are disabled. Packets spawn only
 * on real routed connection IDs at miss/forward + write pierce RPS.
 */

import {
  advanceAuthoritativeSpawns,
  type AuthoritativeTrafficPlan,
} from "./authoritative-edge-traffic.ts";
import type { SimComponent, SimConnection, SimPacket, SimComponentType, PacketShape, SimTickResult } from "./sim-types.ts";

let packetCounter = 0;
const newId = () => `pkt-${++packetCounter}`;

const lbCursors = new Map<string, number>();
const lbArmAngles = new Map<string, number>();
const pubsubFlashes = new Map<string, number>();
/** Useful CDN arrivals; separate from the animation version to avoid visual spam. */
const cdnUsefulArrivalCounts = new Map<string, number>();
const cdnPassCounts = new Map<string, number>();
const cacheHitFlashes = new Map<string, number>();
const componentVisualAccrual = new Map<string, number>();
const authoritativeSpawnAccrual = new Map<string, number>();
const authoritativeForwardAccrual = new Map<string, number>();
const authoritativeSplitAccrual = new Map<string, number>();
const rejectionCounts = new Map<string, number>();

/**
 * Volume honesty for rejections: the first few rejected packets render as
 * individual red × at the port; beyond this cap only the tabular counter
 * climbs, so a meltdown never becomes red confetti.
 */
export const MAX_VISIBLE_REJECTED_PER_COMPONENT = 3;

function stableSlot(packetId: string, capacity: number): number {
  let hash = 0;
  for (let index = 0; index < packetId.length; index += 1) hash = (hash * 31 + packetId.charCodeAt(index)) >>> 0;
  return hash % Math.max(1, capacity);
}

/** Cache activity samples the simulator's realized cache usefulness exactly. */
export function redisVisualSampleRate(realizedHitRate: number): number {
  return Math.min(1, Math.max(0, realizedHitRate));
}

function shouldShowComponentActivity(componentId: string, plan: AuthoritativeTrafficPlan): boolean {
  const activityRate = plan.componentActivityRates?.get(componentId) ?? 1;
  const next = (componentVisualAccrual.get(componentId) ?? 0) + redisVisualSampleRate(activityRate);
  if (next < 1) {
    componentVisualAccrual.set(componentId, next);
    return false;
  }
  componentVisualAccrual.set(componentId, next - 1);
  return true;
}

/** Gives each concurrently dwelling cache packet a deterministic, distinct cell. */
function stableSlots(packetIds: readonly string[], capacity: number): number[] {
  const slots = Math.max(1, capacity);
  const occupied = new Set<number>();
  return [...packetIds].sort().flatMap((packetId) => {
    const initial = stableSlot(packetId, slots);
    for (let offset = 0; offset < slots; offset += 1) {
      const slot = (initial + offset) % slots;
      if (!occupied.has(slot)) {
        occupied.add(slot);
        return [slot];
      }
    }
    return [];
  });
}

/** One CDN node-pass animation represents a four-packet sample. */
export function cdnAnimationPassForArrivalCount(arrivals: number): number {
  return Math.floor(Math.max(0, arrivals) / 4);
}

function recordCdnArrival(componentId: string, useful: boolean): void {
  if (!useful) return;
  const arrivals = (cdnUsefulArrivalCounts.get(componentId) ?? 0) + 1;
  cdnUsefulArrivalCounts.set(componentId, arrivals);
  const animationPass = cdnAnimationPassForArrivalCount(arrivals);
  if (animationPass > (cdnPassCounts.get(componentId) ?? 0)) {
    cdnPassCounts.set(componentId, animationPass);
  }
}

const DWELL_TYPES: SimComponentType[] = [
  "server",
  "sql_db",
  "nosql_db",
  "cache",
  "queue",
  "api_gateway",
  "dns",
  "object_storage",
];

const DWELL_RATE: Partial<Record<SimComponentType, number>> = {
  cache: 2.6,
  dns: 2.6,
  api_gateway: 1.8,
  server: 1.2,
  queue: 0.9,
  nosql_db: 0.8,
  sql_db: 0.55,
  object_storage: 0.5,
};

function liveOutgoing(comp: SimComponent, connections: SimConnection[], components: SimComponent[]): SimConnection[] {
  return connections.filter(
    (connection) =>
      connection.fromComponentId === comp.id &&
      components.find((candidate) => candidate.id === connection.toComponentId)?.state !== "failed",
  );
}

function pickOutbound(comp: SimComponent, outs: SimConnection[]): SimConnection {
  if (comp.type === "load_balancer" && comp.algorithm !== "least-connections") {
    const n = (lbCursors.get(comp.id) ?? 0) + 1;
    lbCursors.set(comp.id, n);
    return outs[n % outs.length];
  }
  return outs[Math.floor(Math.random() * outs.length)];
}

function swingArm(comp: SimComponent, conn: SimConnection) {
  const idx = Math.max(0, comp.outputPorts.findIndex((port) => port.id === conn.fromPortId));
  const n = comp.outputPorts.length;
  lbArmAngles.set(comp.id, n > 1 ? -28 + (56 * idx) / (n - 1) : 0);
}

function shouldForward(comp: SimComponent, outs: SimConnection[]): boolean {
  if (outs.length === 0) return false;
  if (comp.type === "cache") return Math.random() > 0.7;
  if (comp.type === "sql_db" || comp.type === "nosql_db" || comp.type === "dns" || comp.type === "object_storage") {
    return false;
  }
  return true;
}

function respondBack(packet: SimPacket): SimPacket {
  return {
    ...packet,
    shape: "response",
    progress: 0,
    reverse: true,
    dwellComponentId: undefined,
    dwellProgress: undefined,
  };
}

function rejectAt(packet: SimPacket, compId: string): SimPacket {
  rejectionCounts.set(compId, (rejectionCounts.get(compId) ?? 0) + 1);
  return { ...packet, shape: "rejected", progress: 1, dwellComponentId: compId, dwellProgress: 0.4 };
}

function appendTrail(packet: SimPacket, connectionId: string): SimPacket {
  const trail = packet.trailConnectionIds ?? [];
  if (trail.includes(connectionId)) return packet;
  return { ...packet, trailConnectionIds: [...trail, connectionId] };
}

function hopPacket(packet: SimPacket, connectionId: string, reverse: boolean): SimPacket {
  return appendTrail(
    {
      ...packet,
      connectionId,
      progress: 0,
      reverse,
      dwellComponentId: undefined,
      dwellProgress: undefined,
      cacheVisualActive: undefined,
      componentVisualActive: undefined,
    },
    connectionId,
  );
}

function rerouteFromFailedTarget(
  packet: SimPacket,
  conn: SimConnection,
  toComp: SimComponent,
  components: SimComponent[],
  connections: SimConnection[],
): SimPacket[] {
  const fromComp = components.find((candidate) => candidate.id === conn.fromComponentId);
  if (fromComp?.type === "load_balancer") {
    const alternates = liveOutgoing(fromComp, connections, components).filter(
      (outbound) => outbound.toComponentId !== toComp.id,
    );
    if (alternates.length > 0) {
      const next = pickOutbound(fromComp, alternates);
      swingArm(fromComp, next);
      return [hopPacket(packet, next.id, false)];
    }
  }
  return [rejectAt(packet, toComp.id)];
}

function completeRoundTrip(packet: SimPacket, newRouteLingers: string[]): void {
  const trail = [...(packet.trailConnectionIds ?? []), packet.connectionId];
  for (const connectionId of trail) {
    newRouteLingers.push(connectionId);
  }
}

export function resetTickSimulationState(): void {
  packetCounter = 0;
  lbCursors.clear();
  lbArmAngles.clear();
  pubsubFlashes.clear();
  cdnUsefulArrivalCounts.clear();
  cdnPassCounts.clear();
  cacheHitFlashes.clear();
  componentVisualAccrual.clear();
  authoritativeSpawnAccrual.clear();
  authoritativeForwardAccrual.clear();
  authoritativeSplitAccrual.clear();
  rejectionCounts.clear();
}

export type TickSimulationOptions = {
  /** Optional LP-05 path shares — scales ambient edge load / dwell lighting. */
  volumeShareByComponentId?: ReadonlyMap<string, number>;
  /**
   * When set, replaces ambient/random injection: spawn only from sim edge RPS
   * (post-absorb miss/forward + write pierce). Packets do not invent hops.
   */
  authoritativeTraffic?: AuthoritativeTrafficPlan;
};

function laneRps(plan: AuthoritativeTrafficPlan, connectionId: string, shape: PacketShape): number {
  const rate = plan.rates.get(connectionId);
  return shape === "write" ? (rate?.writeRps ?? 0) : (rate?.forwardRps ?? 0);
}

function authoritativeOutgoing(
  componentId: string,
  connections: readonly SimConnection[],
  components: readonly SimComponent[],
  plan: AuthoritativeTrafficPlan,
  shape: PacketShape,
): SimConnection[] {
  return connections.filter((connection) =>
    connection.fromComponentId === componentId &&
    components.find((component) => component.id === connection.toComponentId)?.state !== "failed" &&
    laneRps(plan, connection.id, shape) > 0,
  ).sort((left, right) => left.id.localeCompare(right.id));
}

function chooseAuthoritativeOutgoing(
  componentId: string,
  incomingConnectionId: string,
  shape: PacketShape,
  outgoing: readonly SimConnection[],
  plan: AuthoritativeTrafficPlan,
): SimConnection | null {
  if (outgoing.length === 0) return null;
  if (outgoing.length === 1) return outgoing[0]!;
  const total = outgoing.reduce((sum, connection) => sum + laneRps(plan, connection.id, shape), 0);
  if (total <= 0) return null;
  const key = `${componentId}:${incomingConnectionId}:${shape}`;
  const cursor = (authoritativeSplitAccrual.get(key) ?? 0) + 1;
  authoritativeSplitAccrual.set(key, cursor);
  // Low-discrepancy deterministic sample keeps small visual budgets representative
  // of the simulator's weighted split (rather than always filling the first lane).
  const position = ((cursor * 0.61803398875) % 1) * total;
  let cumulative = 0;
  for (const connection of outgoing) {
    cumulative += laneRps(plan, connection.id, shape);
    if (position < cumulative) return connection;
  }
  return outgoing.at(-1) ?? null;
}

function shouldAuthoritativelyForward(
  componentId: string,
  incomingConnectionId: string,
  shape: PacketShape,
  outgoing: readonly SimConnection[],
  plan: AuthoritativeTrafficPlan,
): boolean {
  if (shape === "write") return outgoing.length > 0;
  const incoming = laneRps(plan, incomingConnectionId, shape);
  const forwarded = outgoing.reduce((sum, connection) => sum + laneRps(plan, connection.id, shape), 0);
  if (incoming <= 0 || forwarded <= 0) return false;
  const key = `${componentId}:${incomingConnectionId}:${shape}`;
  const next = (authoritativeForwardAccrual.get(key) ?? 0) + Math.min(1, forwarded / incoming);
  if (next < 1) {
    authoritativeForwardAccrual.set(key, next);
    return false;
  }
  authoritativeForwardAccrual.set(key, next - 1);
  return true;
}

function authoritativeRootLaneKeys(
  connections: readonly SimConnection[],
  components: readonly SimComponent[],
  plan: AuthoritativeTrafficPlan,
): Set<string> {
  const roots = new Set<string>();
  for (const rate of plan.rates.values()) {
    const connection = connections.find((candidate) => candidate.id === rate.connectionId);
    if (!connection) continue;
    const hasInbound = (shape: PacketShape) => connections.some((candidate) =>
      candidate.toComponentId === connection.fromComponentId &&
      laneRps(plan, candidate.id, shape) > 0 &&
      components.find((component) => component.id === candidate.fromComponentId)?.state !== "failed",
    );
    if (rate.forwardRps > 0 && !hasInbound("request")) roots.add(`${rate.connectionId}:request`);
    if (rate.writeRps > 0 && !hasInbound("write")) roots.add(`${rate.connectionId}:write`);
  }
  return roots;
}

export function tickSimulation(
  components: SimComponent[],
  connections: SimConnection[],
  packets: SimPacket[],
  speed: number,
  tick: number,
  options: TickSimulationOptions = {},
): SimTickResult {
  const volumeShareByComponentId = options.volumeShareByComponentId;
  const authoritative = options.authoritativeTraffic;
  const dt = speed * 0.016;
  const newRouteLingers: string[] = [];

  const updatedPackets = packets.flatMap((packet) => {
    const traveling = appendTrail(packet, packet.connectionId);

    if (traveling.dwellComponentId !== undefined) {
      if (traveling.shape === "rejected") {
        const dwell = (traveling.dwellProgress ?? 0) + dt * 1.5;
        return dwell >= 1 ? [] : [{ ...traveling, dwellProgress: dwell }];
      }
      const comp = components.find((candidate) => candidate.id === traveling.dwellComponentId);
      if (!comp || comp.state === "failed") {
        return [rejectAt(traveling, traveling.dwellComponentId)];
      }
      const rate = DWELL_RATE[comp.type] ?? 1.2;
      const dwell = (traveling.dwellProgress ?? 0) + dt * rate;
      if (dwell < 1) return [{ ...traveling, dwellProgress: dwell }];

      if (authoritative) {
        const outgoing = authoritativeOutgoing(comp.id, connections, components, authoritative, traveling.shape);
        const forward = shouldAuthoritativelyForward(comp.id, traveling.connectionId, traveling.shape, outgoing, authoritative);
        const next = forward
          ? chooseAuthoritativeOutgoing(comp.id, traveling.connectionId, traveling.shape, outgoing, authoritative)
          : null;
        if (next) {
          if (comp.type === "load_balancer") swingArm(comp, next);
          return [hopPacket(traveling, next.id, false)];
        }
        if (comp.type === "cache" && traveling.cacheVisualActive) cacheHitFlashes.set(comp.id, tick);
        completeRoundTrip(traveling, newRouteLingers);
        return [];
      }

      const outs = liveOutgoing(comp, connections, components);
      if (traveling.shape === "request" && shouldForward(comp, outs)) {
        const next = pickOutbound(comp, outs);
        return [hopPacket(traveling, next.id, false)];
      }
      if (comp.type === "cache") {
        cacheHitFlashes.set(comp.id, tick);
      }
      return [respondBack(traveling)];
    }

    const newProgress = traveling.progress + dt * 0.8;
    if (newProgress < 1) return [{ ...traveling, progress: newProgress }];

    const conn = connections.find((candidate) => candidate.id === traveling.connectionId);
    if (!conn) return [];
    const toComp = components.find((candidate) =>
      candidate.id === (traveling.reverse ? conn.fromComponentId : conn.toComponentId),
    );
    if (!toComp) return [];

    if (toComp.state === "failed") {
      return rerouteFromFailedTarget(traveling, conn, toComp, components, connections);
    }

    // Authoritative aggregate mode: every real hop visibly dwells at its target
    // component before the next measured lane is chosen. This keeps the packet
    // story legible (CDN → LB → each Service → cache/store) without inventing
    // a hop, cache outcome, or fallback route.
    if (authoritative) {
      if (traveling.reverse) {
        completeRoundTrip(traveling, newRouteLingers);
        return [];
      }
      if (toComp.type === "cdn") {
        recordCdnArrival(toComp.id, shouldShowComponentActivity(toComp.id, authoritative));
      }
      const componentVisualActive = toComp.type === "cdn"
        ? undefined
        : shouldShowComponentActivity(toComp.id, authoritative);
      return [{
        ...traveling,
        progress: 1,
        dwellComponentId: toComp.id,
        dwellProgress: 0,
        cacheVisualActive: toComp.type === "cache"
          ? componentVisualActive
          : undefined,
        componentVisualActive,
      }];
    }

    if (traveling.shape === "response") {
      if (toComp.type === "user") {
        completeRoundTrip(traveling, newRouteLingers);
        return [];
      }
      const inbound = connections.filter(
        (candidate) => candidate.toComponentId === toComp.id && candidate.id !== conn.id,
      );
      if (inbound.length === 0) return [];
      const next = inbound[Math.floor(Math.random() * inbound.length)];
      return [hopPacket(traveling, next.id, true)];
    }

    if (toComp.type === "user") return [];

    if (toComp.type === "cdn") {
      recordCdnArrival(toComp.id, true);
      const outs = liveOutgoing(toComp, connections, components);
      if (Math.random() < 0.55 || outs.length === 0) return [respondBack(traveling)];
      return [hopPacket(traveling, outs[0].id, false)];
    }

    if (toComp.type === "load_balancer") {
      const outs = liveOutgoing(toComp, connections, components);
      if (outs.length === 0) return [respondBack(traveling)];
      const next = pickOutbound(toComp, outs);
      swingArm(toComp, next);
      return [hopPacket(traveling, next.id, false)];
    }

    if (toComp.type === "pubsub") {
      const outs = liveOutgoing(toComp, connections, components);
      if (outs.length === 0) return [respondBack(traveling)];
      pubsubFlashes.set(toComp.id, tick);
      return outs.map((outbound) =>
        hopPacket({ ...traveling, id: newId() }, outbound.id, false),
      );
    }

    if (DWELL_TYPES.includes(toComp.type)) {
      if (toComp.type === "queue") {
        const occupying = packets.filter(
          (candidate) => candidate.dwellComponentId === toComp.id && candidate.shape !== "rejected",
        ).length;
        if (occupying >= toComp.depth) return [rejectAt(traveling, toComp.id)];
      }
      let entering = traveling;
      if (toComp.type === "sql_db" && traveling.shape === "request" && Math.random() < 0.22) {
        entering = { ...traveling, shape: "write" };
      }
      return [{ ...entering, progress: 1, dwellComponentId: toComp.id, dwellProgress: 0 }];
    }

    return [];
  });

  // Cap visible rejected × per component; the cumulative count carries the rest.
  const rejectedVisible = new Map<string, number>();
  const visiblePackets = updatedPackets.filter((packet) => {
    if (packet.shape !== "rejected") return true;
    const key = packet.dwellComponentId ?? packet.connectionId;
    const seen = rejectedVisible.get(key) ?? 0;
    if (seen >= MAX_VISIBLE_REJECTED_PER_COMPONENT) return false;
    rejectedVisible.set(key, seen + 1);
    return true;
  });

  const newPackets: SimPacket[] = [];

  if (authoritative) {
    const writeCount = updatedPackets.filter((packet) => packet.shape === "write").length;
    const spawns = advanceAuthoritativeSpawns({
      ...authoritative,
      spawnLaneKeys: authoritativeRootLaneKeys(connections, components, authoritative),
    }, authoritativeSpawnAccrual, {
      total: updatedPackets.length,
      writes: writeCount,
    });
    for (const spawn of spawns) {
      if (!connections.some((connection) => connection.id === spawn.connectionId)) continue;
      newPackets.push({
        id: newId(),
        shape: spawn.shape,
        connectionId: spawn.connectionId,
        progress: 0,
        trailConnectionIds: [],
      });
    }
  } else if (tick % 40 === 0) {
    const userComps = components.filter((comp) => comp.type === "user" && comp.state !== "failed");
    for (const user of userComps) {
      const outConns = connections.filter(
        (connection) =>
          connection.fromComponentId === user.id &&
          components.find((candidate) => candidate.id === connection.toComponentId)?.state !== "failed",
      );
      if (outConns.length > 0) {
        const conn = outConns[Math.floor(Math.random() * outConns.length)];
        newPackets.push({
          id: newId(),
          shape: "request",
          connectionId: conn.id,
          progress: 0,
          trailConnectionIds: [],
        });
      }
    }
  }

  const shareScale = (componentId: string): number => {
    if (!volumeShareByComponentId) return 1;
    const share = volumeShareByComponentId.get(componentId);
    if (share === undefined) return 0.12;
    if (share <= 0.005) return 0;
    return Math.min(1, Math.sqrt(share));
  };

  const updatedConnections = connections.map((connection) => {
    const count = visiblePackets.filter((packet) => packet.connectionId === connection.id).length;
    const fromScale = shareScale(connection.fromComponentId);
    const toScale = shareScale(connection.toComponentId);
    const scale = Math.max(fromScale, toScale);
    return { ...connection, load: Math.min(1, count * 0.2 * scale) };
  });

  const updatedComponents = components.map((comp) => {
    const dwellers = visiblePackets.filter(
      (packet) => packet.dwellComponentId === comp.id && packet.shape !== "rejected",
    );
    const visibleDwellers = dwellers.filter((packet) => packet.componentVisualActive !== false);
    // Figma ServerGlyph: every dwelling packet parks in a core 1:1 — no activity
    // sampling (the packet stream is already rate-derived) and no share scaling.
    const processingDwellers = comp.type === "server" ? dwellers : visibleDwellers;
    let processingPackets = processingDwellers.map((packet) => packet.id);

    if (comp.type === "pubsub") {
      const lastFlash = pubsubFlashes.get(comp.id) ?? -Infinity;
      processingPackets = tick - lastFlash < 25 ? ["flash"] : [];
    }

    const passCount =
      comp.type === "cdn" ? (cdnPassCounts.get(comp.id) ?? comp.passCount ?? 0) : comp.passCount;

    let state = comp.state;
    if (state !== "failed") {
      if (processingDwellers.length === 0) state = "idle";
      else if (comp.type === "queue" && processingDwellers.length >= comp.depth) state = "overloaded";
      else if (comp.type === "server" && processingDwellers.length >= comp.instances * 3) state = "overloaded";
      else state = "processing";
    }

    const armAngle =
      comp.type === "load_balancer" ? (lbArmAngles.get(comp.id) ?? comp.armAngle ?? 0) : comp.armAngle;

    const cacheHitFlash =
      comp.type === "cache" && tick - (cacheHitFlashes.get(comp.id) ?? -Infinity) < 12;
    const scale = shareScale(comp.id);
    const mechanismCount = Math.max(
      0,
      comp.type === "cache"
        ? visibleDwellers.length
        : comp.type === "server"
          // ServerGlyph bays represent the configured pool, not individual
          // packets. Average dwellers across instances so a burst does not
          // light every rack and then collapse to one as packets drain.
          ? Math.ceil(processingDwellers.length / Math.max(1, comp.instances))
          : Math.round((comp.type === "cdn" ? (passCount ?? 0) : processingPackets.length) * scale),
    );

    return {
      ...comp,
      state: comp.type !== "cache" && scale <= 0 && state === "processing" ? "idle" : state,
      processingPackets,
      armAngle,
      passCount: comp.type === "cdn" ? Math.round((passCount ?? 0) * scale) : passCount,
      cacheHitFlash: comp.type === "cache" ? cacheHitFlash : scale > 0 && cacheHitFlash,
      mechanismCount,
      processingSlotIndices: comp.type === "cache"
        ? stableSlots(visibleDwellers.map((packet) => packet.id), comp.capacity)
        : undefined,
      rejectedCount: rejectionCounts.get(comp.id) || undefined,
    };
  });

  return {
    components: updatedComponents,
    connections: updatedConnections,
    packets: [...visiblePackets, ...newPackets],
    newRouteLingers,
  };
}

export function spawnWritePacket(connectionId: string): SimPacket {
  return { id: newId(), shape: "write", connectionId, progress: 0 };
}

export type { PacketShape };
