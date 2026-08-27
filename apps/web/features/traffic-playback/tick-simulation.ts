/**
 * Frame tick loop ported 1:1 from Implement Plan/src/simulation.ts (Figma reference).
 * Visual motion only — does not decide routing truth (simulator remains canonical).
 */

import type { SimComponent, SimConnection, SimPacket, SimComponentType, PacketShape, SimTickResult } from "./sim-types";

let packetCounter = 0;
const newId = () => `pkt-${++packetCounter}`;

const lbCursors = new Map<string, number>();
const lbArmAngles = new Map<string, number>();
const pubsubFlashes = new Map<string, number>();
const cdnPassCounts = new Map<string, number>();
const cacheHitFlashes = new Map<string, number>();

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
  cdnPassCounts.clear();
  cacheHitFlashes.clear();
}

export function tickSimulation(
  components: SimComponent[],
  connections: SimConnection[],
  packets: SimPacket[],
  speed: number,
  tick: number,
): SimTickResult {
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
      cdnPassCounts.set(toComp.id, (cdnPassCounts.get(toComp.id) ?? 0) + 1);
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

  const userComps = components.filter((comp) => comp.type === "user" && comp.state !== "failed");
  const newPackets: SimPacket[] = [];

  if (tick % 40 === 0) {
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

  const updatedConnections = connections.map((connection) => {
    const count = updatedPackets.filter((packet) => packet.connectionId === connection.id).length;
    return { ...connection, load: Math.min(1, count * 0.2) };
  });

  const updatedComponents = components.map((comp) => {
    const dwellers = updatedPackets.filter(
      (packet) => packet.dwellComponentId === comp.id && packet.shape !== "rejected",
    );
    let processingPackets = dwellers.map((packet) => packet.id);

    if (comp.type === "pubsub") {
      const lastFlash = pubsubFlashes.get(comp.id) ?? -Infinity;
      processingPackets = tick - lastFlash < 25 ? ["flash"] : [];
    }

    const passCount =
      comp.type === "cdn" ? (cdnPassCounts.get(comp.id) ?? comp.passCount ?? 0) : comp.passCount;

    let state = comp.state;
    if (state !== "failed") {
      if (dwellers.length === 0) state = "idle";
      else if (comp.type === "queue" && dwellers.length >= comp.depth) state = "overloaded";
      else if (comp.type === "server" && dwellers.length >= comp.instances * 3) state = "overloaded";
      else state = "processing";
    }

    const armAngle =
      comp.type === "load_balancer" ? (lbArmAngles.get(comp.id) ?? comp.armAngle ?? 0) : comp.armAngle;

    const cacheHitFlash =
      comp.type === "cache" && tick - (cacheHitFlashes.get(comp.id) ?? -Infinity) < 12;
    const mechanismCount = processingPackets.length;

    return {
      ...comp,
      state,
      processingPackets,
      armAngle,
      passCount,
      cacheHitFlash,
      mechanismCount,
    };
  });

  return {
    components: updatedComponents,
    connections: updatedConnections,
    packets: [...updatedPackets, ...newPackets],
    newRouteLingers,
  };
}

export function spawnWritePacket(connectionId: string): SimPacket {
  return { id: newId(), shape: "write", connectionId, progress: 0 };
}

export type { PacketShape };
