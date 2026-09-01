import type { DesignComponent, Connection } from "./types";

function makeComp(
  id: string,
  type: DesignComponent["type"],
  x: number,
  y: number,
  name: string,
  extra: Partial<DesignComponent> = {}
): DesignComponent {
  const inputPorts = [{ id: `${id}-in0`, side: "left" as const, index: 0, connected: false }];
  const outputPorts = [{ id: `${id}-out0`, side: "right" as const, index: 0, connected: false }];
  return {
    id,
    type,
    x, y,
    name,
    state: "idle",
    instances: 1,
    capacity: 16,
    depth: 8,
    replicas: 0,
    algorithm: "round-robin",
    inputPorts,
    outputPorts,
    stats: { rps: 0, latency: 0 },
    processingPackets: [],
    ...extra,
  };
}

function makeConn(id: string, fromId: string, toId: string): Connection {
  return {
    id,
    fromComponentId: fromId,
    fromPortId: `${fromId}-out0`,
    toComponentId: toId,
    toPortId: `${toId}-in0`,
    load: 0,
  };
}

export function buildHeroScene(): { components: DesignComponent[]; connections: Connection[] } {
  // Layout: us-east region
  // Users(80,160) -> CDN(220,140) -> LB(380,160) -> Server1(540,80), Server2(540,180), Server3(540,280)
  // Server1,2,3 -> Cache(700,160) -> SQL(860,160)
  // LB -> Queue(540,400) -> Worker(700,400)
  const components: DesignComponent[] = [
    makeComp("user1", "user", 60, 220, "Users", { outputPorts: [{ id: "user1-out0", side: "right", index: 0, connected: false }], inputPorts: [] }),
    makeComp("cdn1", "cdn", 200, 200, "CDN"),
    makeComp("lb1", "load_balancer", 380, 200, "Load Balancer", {
      outputPorts: [
        { id: "lb1-out0", side: "right", index: 0, connected: false },
        { id: "lb1-out1", side: "right", index: 1, connected: false },
        { id: "lb1-out2", side: "right", index: 2, connected: false },
      ],
    }),
    makeComp("srv1", "server", 560, 120, "Server 1", { instances: 2 }),
    makeComp("srv2", "server", 560, 220, "Server 2", { instances: 2 }),
    makeComp("srv3", "server", 560, 320, "Server 3", { instances: 2 }),
    makeComp("cache1", "cache", 720, 180, "Redis Cache", { capacity: 16, outputPorts: [{ id: "cache1-out0", side: "right", index: 0, connected: false }], inputPorts: [
      { id: "cache1-in0", side: "left", index: 0, connected: false },
      { id: "cache1-in1", side: "left", index: 1, connected: false },
      { id: "cache1-in2", side: "left", index: 2, connected: false },
    ] }),
    makeComp("sql1", "sql_db", 880, 180, "SQL DB", { replicas: 1, inputPorts: [{ id: "sql1-in0", side: "left", index: 0, connected: false }], outputPorts: [] }),
    makeComp("queue1", "queue", 560, 420, "Work Queue", { depth: 8 }),
    makeComp("worker1", "server", 720, 420, "Worker", { instances: 1 }),
  ];

  const connections: Connection[] = [
    makeConn("c1", "user1", "cdn1"),
    makeConn("c2", "cdn1", "lb1"),
    { id: "c3", fromComponentId: "lb1", fromPortId: "lb1-out0", toComponentId: "srv1", toPortId: "srv1-in0", load: 0 },
    { id: "c4", fromComponentId: "lb1", fromPortId: "lb1-out1", toComponentId: "srv2", toPortId: "srv2-in0", load: 0 },
    { id: "c5", fromComponentId: "lb1", fromPortId: "lb1-out2", toComponentId: "srv3", toPortId: "srv3-in0", load: 0 },
    { id: "c6", fromComponentId: "srv1", fromPortId: "srv1-out0", toComponentId: "cache1", toPortId: "cache1-in0", load: 0 },
    { id: "c7", fromComponentId: "srv2", fromPortId: "srv2-out0", toComponentId: "cache1", toPortId: "cache1-in1", load: 0 },
    { id: "c8", fromComponentId: "srv3", fromPortId: "srv3-out0", toComponentId: "cache1", toPortId: "cache1-in2", load: 0 },
    makeConn("c9", "cache1", "sql1"),
    { id: "c10", fromComponentId: "lb1", fromPortId: "lb1-out1", toComponentId: "queue1", toPortId: "queue1-in0", load: 0 },
    makeConn("c11", "queue1", "worker1"),
  ];

  return { components, connections };
}
