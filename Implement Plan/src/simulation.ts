import type { DesignComponent, Connection, Packet, ComponentType } from "./types";

let packetCounter = 0;
const newId = () => `pkt-${++packetCounter}`;

// Round-robin cursors and pointer-arm positions for load balancers, keyed by component id
const lbCursors = new Map<string, number>();
const lbArmAngles = new Map<string, number>();
// Last tick each pub/sub hub broadcast, so its ring can flash
const pubsubFlashes = new Map<string, number>();
// Total inbound passes per CDN — each increment replays the node ripple once
const cdnPassCounts = new Map<string, number>();

export interface SimTick {
  components: DesignComponent[];
  connections: Connection[];
  packets: Packet[];
}

const DWELL_TYPES: ComponentType[] = [
  "server", "sql_db", "nosql_db", "cache", "queue", "api_gateway", "dns", "object_storage",
];

// Latency is expressed as dwell: cache barely holds a packet, SQL parks it
const DWELL_RATE: Partial<Record<ComponentType, number>> = {
  cache: 2.6,
  dns: 2.6,
  api_gateway: 1.8,
  server: 1.2,
  queue: 0.9,
  nosql_db: 0.8,
  sql_db: 0.55,
  object_storage: 0.5,
};

function liveOutgoing(comp: DesignComponent, connections: Connection[], components: DesignComponent[]): Connection[] {
  return connections.filter(c =>
    c.fromComponentId === comp.id &&
    components.find(d => d.id === c.toComponentId)?.state !== "failed"
  );
}

function pickOutbound(comp: DesignComponent, outs: Connection[]): Connection {
  if (comp.type === "load_balancer" && comp.algorithm !== "least-connections") {
    const n = (lbCursors.get(comp.id) ?? 0) + 1;
    lbCursors.set(comp.id, n);
    return outs[n % outs.length];
  }
  return outs[Math.floor(Math.random() * outs.length)];
}

function swingArm(comp: DesignComponent, conn: Connection) {
  const idx = Math.max(0, comp.outputPorts.findIndex(p => p.id === conn.fromPortId));
  const n = comp.outputPorts.length;
  lbArmAngles.set(comp.id, n > 1 ? -28 + (56 * idx) / (n - 1) : 0);
}

// Does a request leaving this component continue forward, or turn back as a response?
function shouldForward(comp: DesignComponent, outs: Connection[]): boolean {
  if (outs.length === 0) return false;
  if (comp.type === "cache") return Math.random() > 0.7; // ~70% hit: respond without touching storage
  if (comp.type === "sql_db" || comp.type === "nosql_db" || comp.type === "dns" || comp.type === "object_storage") return false;
  return true;
}

function respondBack(p: Packet): Packet {
  return { ...p, shape: "response", progress: 0, reverse: true, dwellComponentId: undefined, dwellProgress: undefined };
}

function rejectAt(p: Packet, compId: string): Packet {
  return { ...p, shape: "rejected", progress: 1, dwellComponentId: compId, dwellProgress: 0.4 };
}

// Advance simulation by one frame
export function tickSimulation(
  components: DesignComponent[],
  connections: Connection[],
  packets: Packet[],
  speed: number,
  tick: number
): SimTick {
  const dt = speed * 0.016; // ~60fps base

  const updatedPackets = packets.flatMap(p => {
    // --- dwelling inside a component ---
    if (p.dwellComponentId !== undefined) {
      // rejected packets halt at the port, then fade
      if (p.shape === "rejected") {
        const dwell = (p.dwellProgress ?? 0) + dt * 1.5;
        return dwell >= 1 ? [] : [{ ...p, dwellProgress: dwell }];
      }
      const comp = components.find(c => c.id === p.dwellComponentId);
      // component failed mid-dwell: eject as a rejection
      if (!comp || comp.state === "failed") {
        return [rejectAt(p, p.dwellComponentId)];
      }
      const rate = DWELL_RATE[comp.type] ?? 1.2;
      const dwell = (p.dwellProgress ?? 0) + dt * rate;
      if (dwell < 1) return [{ ...p, dwellProgress: dwell }];

      // dwell complete — continue forward or turn back as a response
      const outs = liveOutgoing(comp, connections, components);
      if (p.shape === "request" && shouldForward(comp, outs)) {
        const next = pickOutbound(comp, outs);
        return [{ ...p, connectionId: next.id, progress: 0, reverse: false, dwellComponentId: undefined, dwellProgress: undefined }];
      }
      return [respondBack(p)];
    }

    // --- traveling along an edge ---
    const newProgress = p.progress + dt * 0.8;
    if (newProgress < 1) return [{ ...p, progress: newProgress }];

    const conn = connections.find(c => c.id === p.connectionId);
    if (!conn) return [];
    const toComp = components.find(c => c.id === (p.reverse ? conn.fromComponentId : conn.toComponentId));
    if (!toComp) return [];

    // arrived at a failed component: the packet is turned away and halts as a red ×
    if (toComp.state === "failed") return [rejectAt(p, toComp.id)];

    // responses retrace toward the origin without dwelling
    if (p.shape === "response") {
      if (toComp.type === "user") return []; // round trip complete
      const inbound = connections.filter(c => c.toComponentId === toComp.id && c.id !== conn.id);
      if (inbound.length === 0) return [];
      const next = inbound[Math.floor(Math.random() * inbound.length)];
      return [{ ...p, connectionId: next.id, progress: 0, reverse: true }];
    }

    // --- requests arriving at a component ---
    if (toComp.type === "user") return [];

    if (toComp.type === "cdn") {
      // hit: rebound off a cell, origin stays silent; miss: pass through the gate
      // inbound only — responses passing back through never retrigger the ripple
      cdnPassCounts.set(toComp.id, (cdnPassCounts.get(toComp.id) ?? 0) + 1);
      const outs = liveOutgoing(toComp, connections, components);
      if (Math.random() < 0.55 || outs.length === 0) return [respondBack(p)];
      return [{ ...p, connectionId: outs[0].id, progress: 0, reverse: false }];
    }

    if (toComp.type === "load_balancer") {
      const outs = liveOutgoing(toComp, connections, components);
      if (outs.length === 0) return [respondBack(p)];
      const next = pickOutbound(toComp, outs);
      swingArm(toComp, next);
      return [{ ...p, connectionId: next.id, progress: 0, reverse: false }];
    }

    if (toComp.type === "pubsub") {
      // an event exits every output simultaneously
      const outs = liveOutgoing(toComp, connections, components);
      if (outs.length === 0) return [respondBack(p)];
      pubsubFlashes.set(toComp.id, tick);
      return outs.map(o => ({ ...p, id: newId(), connectionId: o.id, progress: 0, reverse: false }));
    }

    if (DWELL_TYPES.includes(toComp.type)) {
      // queue overflow: packets are turned away at the mouth
      if (toComp.type === "queue") {
        const occupying = packets.filter(q => q.dwellComponentId === toComp.id && q.shape !== "rejected").length;
        if (occupying >= (toComp.depth ?? 8)) return [rejectAt(p, toComp.id)];
      }
      return [{ ...p, progress: 1, dwellComponentId: toComp.id, dwellProgress: 0 }];
    }

    return []; // packet consumed
  });

  // Spawn new packets periodically
  const userComps = components.filter(c => c.type === "user" && c.state !== "failed");
  const newPackets: Packet[] = [];

  if (tick % 40 === 0) {
    for (const user of userComps) {
      const outConns = connections.filter(c =>
        c.fromComponentId === user.id &&
        components.find(d => d.id === c.toComponentId)?.state !== "failed"
      );
      if (outConns.length > 0) {
        const conn = outConns[Math.floor(Math.random() * outConns.length)];
        newPackets.push({
          id: newId(),
          shape: "request",
          connectionId: conn.id,
          progress: 0,
        });
      }
    }
  }

  // Update connection loads based on packet density
  const updatedConnections = connections.map(conn => {
    const count = updatedPackets.filter(p => p.connectionId === conn.id).length;
    return { ...conn, load: Math.min(1, count * 0.2) };
  });

  // Update component states based on dwell
  const updatedComponents = components.map(comp => {
    const dwellers = updatedPackets.filter(p => p.dwellComponentId === comp.id && p.shape !== "rejected");
    let processingPackets = dwellers.map(p => p.id);

    // pub/sub never dwells — its ring flashes briefly after each broadcast instead
    if (comp.type === "pubsub") {
      const lastFlash = pubsubFlashes.get(comp.id) ?? -Infinity;
      processingPackets = tick - lastFlash < 25 ? ["flash"] : [];
    }

    // CDN never dwells — its passCount replays the node ripple once per inbound packet
    const passCount = comp.type === "cdn"
      ? (cdnPassCounts.get(comp.id) ?? comp.passCount ?? 0)
      : comp.passCount;

    let state = comp.state;
    if (state !== "failed") {
      if (dwellers.length === 0) state = "idle";
      else if (comp.type === "queue" && dwellers.length >= (comp.depth ?? 8)) state = "overloaded";
      else if (comp.type === "server" && dwellers.length >= (comp.instances ?? 1) * 3) state = "overloaded";
      else state = "processing";
    }

    // Update live stats
    const incomingCount = updatedPackets.filter(p => {
      const conn = connections.find(c => c.id === p.connectionId);
      return conn && (p.reverse ? conn.fromComponentId : conn.toComponentId) === comp.id;
    }).length;

    const stats = { ...comp.stats };
    stats.rps = Math.round(incomingCount * 60);
    if (comp.type === "cache") stats.hitRate = 0.72 + Math.random() * 0.1;
    if (comp.type === "queue") stats.queueDepth = dwellers.length;

    const armAngle = comp.type === "load_balancer"
      ? (lbArmAngles.get(comp.id) ?? comp.armAngle ?? 0)
      : comp.armAngle;

    return { ...comp, state, processingPackets, stats, armAngle, passCount };
  });

  return {
    components: updatedComponents,
    connections: updatedConnections,
    packets: [...updatedPackets, ...newPackets],
  };
}
