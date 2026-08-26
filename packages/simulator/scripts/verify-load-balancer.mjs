import assert from "node:assert/strict";
import { componentRegistry, loadBalancerMonthlyCost } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { checkConnectionCompatibility } from "@faultline/core";
import { estimateMonthlyCost, propagateTraffic, validateArchitectureForSimulation } from "../dist/index.js";

const lb = componentRegistry.get("load-balancer");
const trafficSource = componentRegistry.get("traffic-source");
const service = componentRegistry.get("service");

const trafficOut = trafficSource.ports.find((port) => port.id === "request_out");
const lbIn = lb.ports.find((port) => port.id === "request_in");
const lbOut = lb.ports.find((port) => port.id === "request_out");
const serviceIn = service.ports.find((port) => port.id === "request_in");

assert.ok(trafficOut && lbIn && lbOut && serviceIn);
assert.equal(checkConnectionCompatibility(trafficOut, lbIn, "request").valid, true);
assert.equal(checkConnectionCompatibility(lbOut, serviceIn, "request").valid, true);
assert.ok(loadBalancerMonthlyCost > 0);

function architectureFor(policy) {
  return {
    version: 1,
    components: [
      { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
      { id: "lb-01", type: "load-balancer", config: { policy }, deployments: [], ui: { x: 180, y: 0 } },
      { id: "service-a", type: "service", config: { size: "medium", instances: 2 }, deployments: [], ui: { x: 400, y: -40 } },
      { id: "service-b", type: "service", config: { size: "medium", instances: 6 }, deployments: [], ui: { x: 400, y: 40 } },
      { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 650, y: 0 } },
    ],
    connections: [
      {
        id: "traffic-lb",
        sourceComponentId: "traffic-01",
        sourcePortId: "request_out",
        targetComponentId: "lb-01",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "lb-service-a",
        sourceComponentId: "lb-01",
        sourcePortId: "request_out",
        targetComponentId: "service-a",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "lb-service-b",
        sourceComponentId: "lb-01",
        sourcePortId: "request_out",
        targetComponentId: "service-b",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "service-a-postgres",
        sourceComponentId: "service-a",
        sourcePortId: "database_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
      {
        id: "service-b-postgres",
        sourceComponentId: "service-b",
        sourcePortId: "database_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
}

const challengeWithLb = {
  ...tinyApiChallenge,
  allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "load-balancer"],
};

const equalArchitecture = architectureFor("equal");
assert.equal(
  validateArchitectureForSimulation({
    architecture: equalArchitecture,
    challenge: challengeWithLb,
    registry: componentRegistry,
  }).valid,
  true,
);

const equal = propagateTraffic({
  architecture: equalArchitecture,
  challenge: challengeWithLb,
  registry: componentRegistry,
});
assert.equal(equal.valid, true);
if (!equal.valid) throw new Error("Expected valid equal architecture.");
assert.equal(equal.traffic["lb-01"].incomingRps, 6_000);
assert.equal(equal.traffic["lb-01"].outgoingRps, 6_000);
assert.equal(equal.traffic["service-a"].incomingRps, 3_000);
assert.equal(equal.traffic["service-b"].incomingRps, 3_000);
assert.equal(
  equal.traffic["lb-01"].outgoingRps,
  equal.traffic["service-a"].incomingRps + equal.traffic["service-b"].incomingRps,
);

const weighted = propagateTraffic({
  architecture: architectureFor("capacity_weighted"),
  challenge: challengeWithLb,
  registry: componentRegistry,
});
assert.equal(weighted.valid, true);
if (!weighted.valid) throw new Error("Expected valid weighted architecture.");
// capacities: A=4000, B=12000 → A gets 1500, B gets 4500 of 6000
assert.equal(weighted.traffic["service-a"].incomingRps, 1_500);
assert.equal(weighted.traffic["service-b"].incomingRps, 4_500);
assert.equal(weighted.traffic["lb-01"].outgoingRps, 6_000);

const cost = estimateMonthlyCost({ architecture: equalArchitecture, registry: componentRegistry });
assert.equal(cost.lineItems.some((lineItem) => lineItem.componentId === "lb-01" && lineItem.amount === loadBalancerMonthlyCost), true);
assert.equal(cost.monthlyTotal, 2_000 + 6_000 + 4_000 + loadBalancerMonthlyCost);

console.log("load balancer verified");
