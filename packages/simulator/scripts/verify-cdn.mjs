import assert from "node:assert/strict";
import {
  cdnMonthlyCostForConfig,
  cdnUsageMonthlyCost,
  componentRegistry,
} from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { checkConnectionCompatibility } from "@faultline/core";
import { estimateMonthlyCost, evaluateRequirements, validateArchitectureForSimulation } from "../dist/index.js";

const cdn = componentRegistry.get("cdn");
const trafficSource = componentRegistry.get("traffic-source");
const service = componentRegistry.get("service");

const trafficOut = trafficSource.ports.find((port) => port.id === "request_out");
const cdnIn = cdn.ports.find((port) => port.id === "request_in");
const cdnOut = cdn.ports.find((port) => port.id === "origin_out");
const serviceIn = service.ports.find((port) => port.id === "request_in");

assert.ok(trafficOut && cdnIn && cdnOut && serviceIn);
assert.equal(checkConnectionCompatibility(trafficOut, cdnIn, "request").valid, true);
assert.equal(checkConnectionCompatibility(cdnOut, serviceIn, "request").valid, true);
assert.equal(cdn.simulation.reducesOriginRedirects, true);
assert.equal(cdn.simulation.absorbsWrites, false);
assert.equal(cdn.simulation.geographicRouting, false);

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

const cdnArchitecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    {
      id: "cdn-01",
      type: "cdn",
      config: { coverage: 0.8, ttlBand: "medium", tier: "medium" },
      deployments: [],
      ui: { x: 150, y: 0 },
    },
    { id: "service-01", type: "service", config: { size: "medium", instances: 4 }, deployments: [], ui: { x: 350, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    {
      id: "traffic-cdn",
      sourceComponentId: "traffic-01",
      sourcePortId: "request_out",
      targetComponentId: "cdn-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "cdn-service",
      sourceComponentId: "cdn-01",
      sourcePortId: "origin_out",
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

const challengeWithCdn = {
  ...tinyApiChallenge,
  allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "cdn"],
};

assert.equal(
  validateArchitectureForSimulation({
    architecture: cdnArchitecture,
    challenge: challengeWithCdn,
    registry: componentRegistry,
  }).valid,
  true,
);

const direct = evaluateRequirements({
  architecture: directArchitecture,
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
const withCdn = evaluateRequirements({
  architecture: cdnArchitecture,
  challenge: challengeWithCdn,
  registry: componentRegistry,
});

assert.equal(direct.valid, true);
assert.equal(withCdn.valid, true);
if (!direct.valid || !withCdn.valid) throw new Error("Expected valid architectures.");

assert.equal(withCdn.traffic["cdn-01"].incomingRps, 6_000);
assert.equal(withCdn.caches["cdn-01"].hitRps, 3_240);
assert.equal(withCdn.services["service-01"].incomingRps, 2_760);
assert.ok(withCdn.services["service-01"].incomingRps < direct.services["service-01"].incomingRps);
assert.ok(withCdn.postgres["postgres-01"].readRps < direct.postgres["postgres-01"].readRps);

const cdnIncomingRps = withCdn.traffic["cdn-01"].incomingRps;
const cdnCost = cdnMonthlyCostForConfig({ tier: "medium" }, cdnIncomingRps);
assert.equal(cdnCost, 5_000 + cdnUsageMonthlyCost(cdnIncomingRps));
assert.ok(cdnUsageMonthlyCost(cdnIncomingRps) > 0);
assert.equal(withCdn.cost.monthlyTotal, direct.cost.monthlyTotal + cdnCost);
assert.ok(withCdn.cost.lineItems.some((lineItem) => lineItem.componentId === "cdn-01" && lineItem.amount === cdnCost));

assert.deepEqual(
  estimateMonthlyCost({ architecture: cdnArchitecture, registry: componentRegistry }).lineItems.find(
    (lineItem) => lineItem.componentId === "cdn-01",
  ),
  { componentId: "cdn-01", amount: 5_000 },
);
assert.deepEqual(
  estimateMonthlyCost({
    architecture: cdnArchitecture,
    registry: componentRegistry,
    traffic: withCdn.traffic,
  }).lineItems.find((lineItem) => lineItem.componentId === "cdn-01"),
  { componentId: "cdn-01", amount: cdnCost },
);
assert.ok(
  estimateMonthlyCost({
    architecture: cdnArchitecture,
    registry: componentRegistry,
    traffic: { "cdn-01": { incomingRps: 12_000 } },
  }).monthlyTotal >
    estimateMonthlyCost({
      architecture: cdnArchitecture,
      registry: componentRegistry,
      traffic: { "cdn-01": { incomingRps: 6_000 } },
    }).monthlyTotal,
);

console.log("cdn component verified");
