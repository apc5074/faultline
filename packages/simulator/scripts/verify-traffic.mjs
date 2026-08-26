import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { propagateTraffic } from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "service-disconnected", type: "service", config: { instances: 1 }, deployments: [], ui: { x: 300, y: 200 } },
  ],
  connections: [
    { id: "service-postgres", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
  ],
};

const result = propagateTraffic({ architecture, challenge: tinyApiChallenge, registry: componentRegistry });
assert.equal(result.valid, true);
if (!result.valid) throw new Error("Expected valid architecture.");
assert.deepEqual(result.traffic["traffic-01"], { incomingRps: 0, outgoingRps: 6000, readRps: 0, writeRps: 0 });
assert.deepEqual(result.traffic["service-01"], { incomingRps: 6000, outgoingRps: 6000, readRps: 0, writeRps: 0 });
assert.deepEqual(result.traffic["postgres-01"], { incomingRps: 6000, outgoingRps: 0, readRps: 5400, writeRps: 600 });
assert.deepEqual(result.traffic["service-disconnected"], { incomingRps: 0, outgoingRps: 0, readRps: 0, writeRps: 0 });
assert.deepEqual(result.events.map((event) => event.type), ["simulation_started", "traffic_routed", "traffic_routed", "simulation_finished"]);

const reordered = { ...architecture, components: [...architecture.components].reverse(), connections: [...architecture.connections].reverse() };
assert.deepEqual(propagateTraffic({ architecture: reordered, challenge: tinyApiChallenge, registry: componentRegistry }), result);
console.log("simulator traffic propagation verified");
