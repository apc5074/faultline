/**
 * VIS-001/002 — authoritative edge tokens follow post-absorb miss + write pierce RPS.
 *
 * Usage: pnpm --filter @faultline/web verify:authoritative-traffic-tokens
 */
import assert from "node:assert/strict";

import { urlShortenerChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "@faultline/simulator";
import {
  createSevenComponentArchitecture,
  level1CompositionChallenge,
} from "../../../packages/simulator/scripts/fixtures/level1-composition.mjs";

import {
  advanceAuthoritativeSpawns,
  edgeRatesFromTrafficEvents,
  spawnAccrualPerTick,
} from "../features/traffic-playback/authoritative-edge-traffic.ts";
import {
  cdnAnimationPassForArrivalCount,
  redisVisualSampleRate,
  resetTickSimulationState,
  tickSimulation,
} from "../features/traffic-playback/tick-simulation.ts";

const redirectRps =
  urlShortenerChallenge.workload.requestsPerSecond * urlShortenerChallenge.workload.readRatio;

const traffic = {
  id: "t1",
  type: "traffic-source",
  config: { label: "Incoming traffic" },
  deployments: [],
  ui: { x: 0, y: 0 },
};

function service(id, instances = 6) {
  return {
    id,
    type: "service",
    config: { size: "large", instances },
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

function postgres(id) {
  return {
    id,
    type: "postgres",
    config: { tier: "large", readReplicaCount: 2 },
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

function redis(id) {
  return {
    id,
    type: "redis",
    config: { mode: "standalone", tier: "large", ttlBand: "long" },
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

function cdn(id) {
  return {
    id,
    type: "cdn",
    config: { coverage: 1, ttlBand: "long", tier: "large" },
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

function lb(id) {
  return { id, type: "load-balancer", config: { policy: "equal" }, deployments: [], ui: { x: 0, y: 0 } };
}

function req(id, source, target, sourcePort = "request_out", targetPort = "request_in") {
  return {
    id,
    sourceComponentId: source,
    sourcePortId: sourcePort,
    targetComponentId: target,
    targetPortId: targetPort,
    type: "request",
  };
}

function db(id, source, target, sourcePort, targetPort) {
  return {
    id,
    sourceComponentId: source,
    sourcePortId: sourcePort,
    targetComponentId: target,
    targetPortId: targetPort,
    type: "read_write",
  };
}

const architecture = {
  version: 1,
  components: [
    traffic,
    cdn("cdn1"),
    lb("lb1"),
    service("svc1"),
    redis("redis1"),
    postgres("pg1"),
  ],
  connections: [
    req("e-ingress", "t1", "cdn1"),
    req("e-origin", "cdn1", "lb1", "origin_out", "request_in"),
    req("e-svc", "lb1", "svc1"),
    db("e-redis", "svc1", "redis1", "database_out", "cache_in"),
    db("e-pierce", "redis1", "pg1", "origin_out", "database_in"),
  ],
};

function blankSimGraph() {
  const components = [
    {
      id: "t1",
      type: "user",
      state: "idle",
      instances: 1,
      capacity: 1,
      depth: 1,
      replicas: 0,
      algorithm: "round-robin",
      inputPorts: [],
      outputPorts: [{ id: "request_out" }],
      processingPackets: [],
    },
    {
      id: "cdn1",
      type: "cdn",
      state: "idle",
      instances: 1,
      capacity: 1,
      depth: 1,
      replicas: 0,
      algorithm: "round-robin",
      inputPorts: [{ id: "request_in" }],
      outputPorts: [{ id: "origin_out" }],
      processingPackets: [],
    },
    {
      id: "lb1",
      type: "load_balancer",
      state: "idle",
      instances: 1,
      capacity: 1,
      depth: 1,
      replicas: 0,
      algorithm: "round-robin",
      inputPorts: [{ id: "request_in" }],
      outputPorts: [{ id: "request_out" }],
      processingPackets: [],
    },
    {
      id: "svc1",
      type: "server",
      state: "idle",
      instances: 6,
      capacity: 6,
      depth: 1,
      replicas: 0,
      algorithm: "round-robin",
      inputPorts: [{ id: "request_in" }],
      outputPorts: [{ id: "database_out" }],
      processingPackets: [],
    },
    {
      id: "redis1",
      type: "cache",
      state: "idle",
      instances: 1,
      capacity: 1,
      depth: 1,
      replicas: 0,
      algorithm: "round-robin",
      inputPorts: [{ id: "cache_in" }],
      outputPorts: [{ id: "origin_out" }],
      processingPackets: [],
    },
    {
      id: "pg1",
      type: "sql_db",
      state: "idle",
      instances: 1,
      capacity: 1,
      depth: 1,
      replicas: 2,
      algorithm: "round-robin",
      inputPorts: [{ id: "database_in" }],
      outputPorts: [],
      processingPackets: [],
    },
  ];
  const connections = [
    { id: "e-ingress", fromComponentId: "t1", fromPortId: "request_out", toComponentId: "cdn1", toPortId: "request_in", load: 0 },
    { id: "e-origin", fromComponentId: "cdn1", fromPortId: "origin_out", toComponentId: "lb1", toPortId: "request_in", load: 0 },
    { id: "e-svc", fromComponentId: "lb1", fromPortId: "request_out", toComponentId: "svc1", toPortId: "request_in", load: 0 },
    { id: "e-redis", fromComponentId: "svc1", fromPortId: "database_out", toComponentId: "redis1", toPortId: "cache_in", load: 0 },
    { id: "e-pierce", fromComponentId: "redis1", fromPortId: "origin_out", toComponentId: "pg1", toPortId: "database_in", load: 0 },
  ];
  return { components, connections };
}

console.log("Check — edge rates: CDN absorb reduces origin forward RPS");
const sim = evaluateRequirements({
  architecture,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(sim.valid, true);

const rates = edgeRatesFromTrafficEvents(sim.events);
const ingress = rates.get("e-ingress");
const origin = rates.get("e-origin");
assert.ok(ingress && ingress.forwardRps > 0, "ingress edge has demand");
assert.ok(origin, "origin edge present");
assert.ok(
  origin.forwardRps < ingress.forwardRps,
  `origin forward (${origin.forwardRps}) must be < ingress (${ingress.forwardRps}) after CDN absorb`,
);

const pierce = rates.get("e-pierce");
assert.ok(pierce, "redis→postgres pierce edge");
assert.ok(pierce.writeRps > 0, "write pierce RPS must continue through cache");
assert.equal(pierce.forwardRps, sim.caches["redis1"].missRps);

console.log("Check — spawn accrual monotonic in RPS");
assert.ok(spawnAccrualPerTick(origin.forwardRps, redirectRps) < spawnAccrualPerTick(ingress.forwardRps, redirectRps));
assert.equal(spawnAccrualPerTick(0, redirectRps), 0);

console.log("Check — CDN visual pass is sampled once per four arrivals");
assert.equal(cdnAnimationPassForArrivalCount(3), 0);
assert.equal(cdnAnimationPassForArrivalCount(4), 1);
assert.equal(cdnAnimationPassForArrivalCount(7), 1);
assert.equal(cdnAnimationPassForArrivalCount(8), 2);

console.log("Check — Redis visual sampling follows realized cache usefulness");
assert.equal(redisVisualSampleRate(0), 0);
assert.equal(redisVisualSampleRate(0.5), 0.5);
assert.equal(redisVisualSampleRate(1), 1);

console.log("Check — write lane spawns even when reads absorbed");
const writeOnlyRates = new Map([
  ["e-pierce", { connectionId: "e-pierce", forwardRps: 0, writeRps: redirectRps * 0.1 }],
]);
const accumulators = new Map();
let writeSpawns = 0;
for (let tick = 0; tick < 200 && writeSpawns === 0; tick += 1) {
  writeSpawns += advanceAuthoritativeSpawns(
    { rates: writeOnlyRates, redirectRps },
    accumulators,
    0,
  ).filter((spawn) => spawn.shape === "write").length;
}
assert.ok(writeSpawns > 0, "write pierce must eventually spawn write tokens");

console.log("Check — authoritative tick disables ambient equal-rate theater");
resetTickSimulationState();
let { components, connections } = blankSimGraph();
let packets = [];

for (let tick = 0; tick <= 40; tick += 1) {
  const result = tickSimulation(components, connections, packets, 1, tick);
  components = result.components;
  connections = result.connections;
  packets = result.packets;
}
assert.ok(packets.length > 0, "ambient mode still spawns before evidence");

resetTickSimulationState();
({ components, connections } = blankSimGraph());
packets = [];
const plan = { rates, redirectRps, componentActivityRates: new Map([["redis1", 1]]) };
for (let tick = 0; tick <= 40; tick += 1) {
  const result = tickSimulation(components, connections, packets, 1, tick, {
    authoritativeTraffic: plan,
  });
  components = result.components;
  connections = result.connections;
  packets = result.packets;
}

const onOrigin = packets.filter((packet) => packet.connectionId === "e-origin").length;
const onIngress = packets.filter((packet) => packet.connectionId === "e-ingress").length;
assert.ok(
  onOrigin <= onIngress,
  `authoritative tokens: origin (${onOrigin}) should not exceed ingress (${onIngress})`,
);

console.log("Check — authoritative packets chain through routed components");
resetTickSimulationState();
({ components, connections } = blankSimGraph());
packets = [];
let sawChainedOrigin = false;
for (let tick = 0; tick < 800 && !sawChainedOrigin; tick += 1) {
  const result = tickSimulation(components, connections, packets, 1, tick, {
    authoritativeTraffic: plan,
  });
  components = result.components;
  connections = result.connections;
  packets = result.packets;
  sawChainedOrigin = packets.some(
    (packet) => packet.connectionId === "e-origin" && packet.trailConnectionIds?.includes("e-ingress"),
  );
}
assert.ok(sawChainedOrigin, "an origin-bound token must visibly arrive through the CDN ingress lane");

console.log("Check — chained packets dwell at each real component");
resetTickSimulationState();
({ components, connections } = blankSimGraph());
packets = [];
const dwelled = new Set();
for (let tick = 0; tick < 2000 && dwelled.size < 5; tick += 1) {
  const result = tickSimulation(components, connections, packets, 1, tick, {
    authoritativeTraffic: plan,
  });
  components = result.components;
  connections = result.connections;
  packets = result.packets;
  for (const packet of packets) if (packet.dwellComponentId) dwelled.add(packet.dwellComponentId);
}
for (const componentId of ["cdn1", "lb1", "svc1", "redis1", "pg1"]) {
  assert.ok(dwelled.has(componentId), `packet should visibly dwell at ${componentId}`);
}

console.log("Check — Redis cells illuminate only while a packet dwells there");
resetTickSimulationState();
({ components, connections } = blankSimGraph());
packets = [];
let sawRedisDwell = false;
for (let tick = 0; tick < 2000 && !sawRedisDwell; tick += 1) {
  const result = tickSimulation(components, connections, packets, 1, tick, {
    authoritativeTraffic: plan,
  });
  components = result.components;
  connections = result.connections;
  packets = result.packets;
  const redis = components.find((component) => component.id === "redis1");
  const redisDwellers = packets.filter(
    (packet) =>
      packet.dwellComponentId === "redis1" &&
      packet.shape !== "rejected" &&
      packet.cacheVisualActive,
  );
  assert.equal(
    redis?.mechanismCount,
    redisDwellers.length,
    "Redis should not add synthetic processing cells",
  );
  assert.equal(
    redis?.processingSlotIndices?.length,
    new Set(redisDwellers.map((packet) => packet.id)).size,
    "each dwelling packet should own one stable Redis cell",
  );
  sawRedisDwell = redisDwellers.length > 0;
}
assert.ok(sawRedisDwell, "a packet should eventually illuminate Redis");

console.log("Check — server cores park every dwelling packet 1:1 (Figma ServerGlyph)");
resetTickSimulationState();
({ components, connections } = blankSimGraph());
packets = [];
// Deliberately sample svc1 activity below 1: bays must still track every parked
// packet — saturation reads as all cores full, never as a quieter server.
const sampledPlan = {
  rates,
  redirectRps,
  componentActivityRates: new Map([["redis1", 1], ["svc1", 0.5]]),
};
let sawServerDwell = false;
for (let tick = 0; tick < 2000 && !sawServerDwell; tick += 1) {
  const result = tickSimulation(components, connections, packets, 1, tick, {
    authoritativeTraffic: sampledPlan,
  });
  components = result.components;
  connections = result.connections;
  packets = result.packets;
  const server = components.find((component) => component.id === "svc1");
  const serverDwellers = packets.filter(
    (packet) => packet.dwellComponentId === "svc1" && packet.shape !== "rejected",
  );
  assert.equal(
    server?.mechanismCount,
    serverDwellers.length,
    "each packet dwelling in a server should park in exactly one core",
  );
  sawServerDwell = serverDwellers.length > 0;
}
assert.ok(sawServerDwell, "a packet should eventually park in a server core");

resetTickSimulationState();
({ components, connections } = blankSimGraph());
packets = [];
let sawPierceWrite = false;
for (let tick = 0; tick < 400 && !sawPierceWrite; tick += 1) {
  const result = tickSimulation(components, connections, packets, 1, tick, {
    authoritativeTraffic: plan,
  });
  components = result.components;
  connections = result.connections;
  packets = result.packets;
  sawPierceWrite = packets.some(
    (packet) => packet.connectionId === "e-pierce" && packet.shape === "write",
  );
}
assert.ok(sawPierceWrite, "authoritative playback eventually shows write pierce tokens");

console.log("Check — geo authoritative playback quiets CDN origin edges and preserves write pierce");
const geoSimulation = evaluateRequirements({
  architecture: createSevenComponentArchitecture({ regional: true }),
  challenge: level1CompositionChallenge,
  registry: componentRegistry,
});
assert.equal(geoSimulation.valid, true);
if (!geoSimulation.valid) throw new Error("expected valid regional simulation");
const geoRates = edgeRatesFromTrafficEvents(geoSimulation.events);
const geoIngress = geoRates.get("traffic-cdn");
const geoOrigin = geoRates.get("cdn-router");
const geoPierce = geoRates.get("redis-postgres");
assert.ok(geoIngress && geoIngress.forwardRps > 0, "geo ingress edge has demand");
assert.ok(geoOrigin && geoOrigin.forwardRps < geoIngress.forwardRps, "geo CDN origin edge must be quieter than ingress");
assert.ok(geoPierce && geoPierce.writeRps > 0, "geo write pierce must remain visible");

const geoPlan = {
  rates: geoRates,
  redirectRps: level1CompositionChallenge.workload.requestsPerSecond * level1CompositionChallenge.workload.readRatio,
};
const geoSpawns = [];
const geoAccumulators = new Map();
for (let tick = 0; tick < 400; tick += 1) {
  geoSpawns.push(...advanceAuthoritativeSpawns(geoPlan, geoAccumulators, 0));
}
assert.ok(
  geoSpawns.some((spawn) => spawn.connectionId === "redis-postgres" && spawn.shape === "write"),
  "geo authoritative playback must spawn a write token on the pierce edge",
);

console.log("authoritative traffic tokens verified");
