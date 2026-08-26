import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { checkConnectionCompatibility } from "@faultline/core";
import { estimateMonthlyCost, evaluateRequirements, propagateTraffic, validateArchitectureForSimulation } from "../dist/index.js";

const router = componentRegistry.get("global-router");
const trafficSource = componentRegistry.get("traffic-source");
const service = componentRegistry.get("service");

const trafficOut = trafficSource.ports.find((port) => port.id === "request_out");
const routerIn = router.ports.find((port) => port.id === "request_in");
const routerOut = router.ports.find((port) => port.id === "route_out");
const serviceIn = service.ports.find((port) => port.id === "request_in");

assert.ok(trafficOut && routerIn && routerOut && serviceIn);
assert.equal(checkConnectionCompatibility(trafficOut, routerIn, "request").valid, true);
assert.equal(checkConnectionCompatibility(routerOut, serviceIn, "request").valid, true);
assert.equal(router.simulation.geographicRouting, false);
assert.equal(router.simulation.forwardsRequests, true);

const directArchitecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { size: "medium", instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    {
      id: "traffic-service",
      sourceComponentId: "traffic-01",
      sourcePortId: "request_out",
      targetComponentId: "service-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "service-postgres",
      sourceComponentId: "service-01",
      sourcePortId: "database_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    },
  ],
};

const routedArchitecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "router-01", type: "global-router", config: {}, deployments: [], ui: { x: 150, y: 0 } },
    { id: "service-01", type: "service", config: { size: "medium", instances: 4 }, deployments: [], ui: { x: 350, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    {
      id: "traffic-router",
      sourceComponentId: "traffic-01",
      sourcePortId: "request_out",
      targetComponentId: "router-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "router-service",
      sourceComponentId: "router-01",
      sourcePortId: "route_out",
      targetComponentId: "service-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "service-postgres",
      sourceComponentId: "service-01",
      sourcePortId: "database_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    },
  ],
};

const challengeWithRouter = {
  ...tinyApiChallenge,
  allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "global-router"],
};

const validation = validateArchitectureForSimulation({
  architecture: routedArchitecture,
  challenge: challengeWithRouter,
  registry: componentRegistry,
});
assert.equal(validation.valid, true);

const direct = evaluateRequirements({
  architecture: directArchitecture,
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
const routed = evaluateRequirements({
  architecture: routedArchitecture,
  challenge: challengeWithRouter,
  registry: componentRegistry,
});

assert.equal(direct.valid, true);
assert.equal(routed.valid, true);
if (!direct.valid || !routed.valid) throw new Error("Expected valid architectures.");

assert.equal(routed.traffic["router-01"].incomingRps, 6_000);
assert.equal(routed.traffic["router-01"].outgoingRps, 6_000);
assert.equal(routed.services["service-01"].incomingRps, direct.services["service-01"].incomingRps);
assert.equal(routed.services["service-01"].utilization, direct.services["service-01"].utilization);
assert.equal(routed.postgres["postgres-01"].readRps, direct.postgres["postgres-01"].readRps);
assert.equal(routed.p95LatencyMs, direct.p95LatencyMs);
assert.equal(routed.cost.monthlyTotal, direct.cost.monthlyTotal);

const split = propagateTraffic({
  architecture: {
    ...routedArchitecture,
    components: [
      ...routedArchitecture.components,
      { id: "service-02", type: "service", config: { size: "medium", instances: 4 }, deployments: [], ui: { x: 350, y: 120 } },
    ],
    connections: [
      routedArchitecture.connections[0],
      {
        id: "router-service-a",
        sourceComponentId: "router-01",
        sourcePortId: "route_out",
        targetComponentId: "service-01",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "router-service-b",
        sourceComponentId: "router-01",
        sourcePortId: "route_out",
        targetComponentId: "service-02",
        targetPortId: "request_in",
        type: "request",
      },
      routedArchitecture.connections[2],
    ],
  },
  challenge: challengeWithRouter,
  registry: componentRegistry,
});
assert.equal(split.valid, true);
if (!split.valid) throw new Error("Expected valid split architecture.");
assert.equal(split.traffic["service-01"].incomingRps, 3_000);
assert.equal(split.traffic["service-02"].incomingRps, 3_000);

assert.equal(
  estimateMonthlyCost({ architecture: routedArchitecture, registry: componentRegistry }).monthlyTotal,
  8_000,
);

console.log("global router verified");
