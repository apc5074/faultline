import assert from "node:assert/strict";
import { componentRegistry, secondsPerBillingMonth } from "@faultline/component-catalog";
import { urlShortenerChallenge, tinyApiChallenge } from "@faultline/challenges";
import {
  crossRegionTransferUsdPerGb,
  estimateMonthlyCost,
  estimateCrossRegionTransferCost,
  evaluateRequirements,
  monthlyTransferCostUsd,
  propagateTraffic,
  sameRegionTransferUsdPerGb,
} from "../dist/index.js";

assert.equal(sameRegionTransferUsdPerGb, 0);
assert.ok(crossRegionTransferUsdPerGb > 0);
assert.equal(monthlyTransferCostUsd(0, crossRegionTransferUsdPerGb), 0);
assert.equal(
  monthlyTransferCostUsd(1_000_000_000 / secondsPerBillingMonth, crossRegionTransferUsdPerGb),
  Math.round(crossRegionTransferUsdPerGb),
);

const sameRegionOnlyRoutes = [
  {
    originRegion: "us-east",
    destinationRegion: "us-east",
    componentId: "service-01",
    deploymentId: "dep",
    rps: 50_000,
    networkLatencyMs: 10,
    kind: "request",
  },
  {
    originRegion: "us-east",
    destinationRegion: "us-east",
    componentId: "postgres-01",
    deploymentId: "dep",
    rps: 40_000,
    networkLatencyMs: 10,
    kind: "read",
  },
];

assert.deepEqual(
  estimateCrossRegionTransferCost({
    architecture: { version: 1, components: [], connections: [] },
    challenge: urlShortenerChallenge,
    geographicRoutes: sameRegionOnlyRoutes,
  }),
  [],
);

const crossRegionRoutes = [
  {
    originRegion: "europe",
    destinationRegion: "us-east",
    componentId: "postgres-01",
    deploymentId: "dep",
    rps: 10_000,
    networkLatencyMs: 80,
    kind: "write",
  },
];
const synthetic = estimateCrossRegionTransferCost({
  architecture: { version: 1, components: [], connections: [] },
  challenge: urlShortenerChallenge,
  geographicRoutes: crossRegionRoutes,
});
assert.equal(synthetic.length, 1);
assert.ok(synthetic[0].amount > 0);
assert.match(synthetic[0].label, /^Transfer · Europe → US East$/);

function geoArchitecture({ serviceRegions, replicaRegions = [] }) {
  const serviceDeployments = serviceRegions.map((regionId, index) => ({
    id: `svc-${regionId}`,
    regionId,
    config: { instances: index === 0 ? 10 - (serviceRegions.length - 1) : 1 },
  }));
  const instances = serviceDeployments.reduce((sum, deployment) => sum + deployment.config.instances, 0);
  const replicas = replicaRegions.map((regionId) => ({
    id: `pg-${regionId}`,
    regionId,
    config: { role: "replica" },
  }));
  return {
    version: 1,
    components: [
      {
        id: "traffic-01",
        type: "traffic-source",
        config: { label: "Incoming traffic" },
        deployments: [],
        ui: { x: 0, y: 0 },
      },
      { id: "router-01", type: "global-router", config: {}, deployments: [], ui: { x: 120, y: 0 } },
      {
        id: "service-01",
        type: "service",
        config: { size: "medium", instances },
        deployments: serviceDeployments,
        ui: { x: 300, y: 0 },
      },
      {
        id: "postgres-01",
        type: "postgres",
        config: { tier: "large", readReplicaCount: replicas.length },
        deployments: [
          { id: "pg-primary", regionId: "us-east", config: { role: "primary" } },
          ...replicas,
        ],
        ui: { x: 480, y: 0 },
      },
    ],
    connections: [
      {
        id: "t-r",
        sourceComponentId: "traffic-01",
        sourcePortId: "request_out",
        targetComponentId: "router-01",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "r-s",
        sourceComponentId: "router-01",
        sourcePortId: "route_out",
        targetComponentId: "service-01",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "s-pg",
        sourceComponentId: "service-01",
        sourcePortId: "database_out",
        targetComponentId: "postgres-01",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
}

const usEastOnly = geoArchitecture({ serviceRegions: ["us-east"] });
const multiRegion = geoArchitecture({
  serviceRegions: ["us-east", "europe", "singapore"],
  replicaRegions: ["europe", "singapore"],
});

const eastTraffic = propagateTraffic({
  architecture: usEastOnly,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
const multiTraffic = propagateTraffic({
  architecture: multiRegion,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(eastTraffic.valid, true);
assert.equal(multiTraffic.valid, true);
if (!eastTraffic.valid || !multiTraffic.valid) throw new Error("expected valid");

const eastCost = estimateMonthlyCost({
  architecture: usEastOnly,
  registry: componentRegistry,
  traffic: eastTraffic.traffic,
  geographicRoutes: eastTraffic.geographicRoutes,
  challenge: urlShortenerChallenge,
});
const multiCost = estimateMonthlyCost({
  architecture: multiRegion,
  registry: componentRegistry,
  traffic: multiTraffic.traffic,
  geographicRoutes: multiTraffic.geographicRoutes,
  challenge: urlShortenerChallenge,
});

assert.ok(
  eastCost.lineItems.some((item) => item.componentId.startsWith("xfer:")),
  "cross-region user→service routes must produce transfer cost",
);
assert.ok(
  multiCost.lineItems.some((item) => item.componentId.startsWith("repl:")),
  "remote replicas must produce replication transfer cost",
);
assert.notEqual(
  eastCost.monthlyTotal,
  multiCost.monthlyTotal,
  "moving deployments must alter monthly cost",
);

const transferOnlyEast = eastCost.lineItems
  .filter((item) => item.componentId.startsWith("xfer:"))
  .reduce((sum, item) => sum + item.amount, 0);
const transferOnlyMulti = multiCost.lineItems
  .filter((item) => item.componentId.startsWith("xfer:"))
  .reduce((sum, item) => sum + item.amount, 0);
assert.ok(
  transferOnlyMulti < transferOnlyEast,
  "regional services should reduce cross-region request transfer vs single distant region",
);

const requirements = evaluateRequirements({
  architecture: multiRegion,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(requirements.valid, true);
if (!requirements.valid) throw new Error("expected valid");
assert.equal(requirements.cost.monthlyTotal, multiCost.monthlyTotal);
assert.ok(requirements.cost.lineItems.some((item) => item.componentId.startsWith("xfer:")));

const noRoutes = estimateMonthlyCost({
  architecture: usEastOnly,
  registry: componentRegistry,
});
assert.ok(
  noRoutes.lineItems.every((item) => !item.componentId.startsWith("xfer:") && !item.componentId.startsWith("repl:")),
);

const tiny = estimateMonthlyCost({
  architecture: {
    version: 1,
    components: [
      {
        id: "traffic-01",
        type: "traffic-source",
        config: { label: "Incoming traffic" },
        deployments: [],
        ui: { x: 0, y: 0 },
      },
      { id: "service-01", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
      { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
    ],
    connections: [],
  },
  registry: componentRegistry,
  challenge: tinyApiChallenge,
});
assert.equal(tiny.monthlyTotal, 8_000);

assert.ok(urlShortenerChallenge.transferPayload);
assert.deepEqual(
  estimateCrossRegionTransferCost({
    architecture: usEastOnly,
    challenge: urlShortenerChallenge,
    geographicRoutes: eastTraffic.geographicRoutes,
  }),
  estimateCrossRegionTransferCost({
    architecture: usEastOnly,
    challenge: urlShortenerChallenge,
    geographicRoutes: eastTraffic.geographicRoutes,
  }),
);

console.log("cross-region transfer cost verified");
