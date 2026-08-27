import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge, urlShortenerChallenge } from "@faultline/challenges";
import { deriveRegionalWorkload, evaluateRequirements, propagateTraffic } from "../dist/index.js";

const regional = deriveRegionalWorkload(urlShortenerChallenge);
assert.equal(regional.active, true);
assert.equal(regional.writeDistributionMatchesRedirects, true);
assert.equal(regional.totalRedirectRps, 120_000);
assert.equal(regional.totalWriteRps, 4_000);
assert.equal(regional.totalHotKeyRedirectRps, 30_000);

const byRegion = Object.fromEntries(regional.origins.map((origin) => [origin.regionId, origin]));
assert.equal(byRegion["us-east"].redirectRps, 30_000);
assert.equal(byRegion["us-west"].redirectRps, 24_000);
assert.equal(byRegion.europe.redirectRps, 30_000);
assert.equal(byRegion.india.redirectRps, 12_000);
assert.equal(byRegion.singapore.redirectRps, 12_000);
assert.equal(byRegion.tokyo.redirectRps, 12_000);

assert.equal(byRegion["us-east"].writeRps, 1_000);
assert.equal(byRegion["us-west"].writeRps, 800);
assert.equal(byRegion.europe.writeRps, 1_000);
assert.equal(byRegion.india.writeRps, 400);

assert.equal(byRegion["us-east"].hotKeyRedirectRps, 7_500);
assert.equal(
  regional.origins.reduce((sum, origin) => sum + origin.redirectRps, 0),
  regional.totalRedirectRps,
);
assert.equal(
  regional.origins.reduce((sum, origin) => sum + origin.writeRps, 0),
  regional.totalWriteRps,
);
assert.equal(
  regional.origins.reduce((sum, origin) => sum + origin.hotKeyRedirectRps, 0),
  regional.totalHotKeyRedirectRps,
);

assert.equal(deriveRegionalWorkload(tinyApiChallenge).active, false);

const architecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { size: "large", instances: 10 }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "large", readReplicaCount: 4 }, deployments: [], ui: { x: 600, y: 0 } },
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

const traffic = propagateTraffic({
  architecture,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(traffic.valid, true);
if (!traffic.valid) throw new Error("expected valid traffic");
assert.equal(traffic.regionalWorkload.active, true);
assert.equal(traffic.regionalWorkload.origins.length, 6);
assert.equal(traffic.regionalWorkload.origins.find((origin) => origin.regionId === "us-east")?.redirectRps, 30_000);

const result = evaluateRequirements({
  architecture,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(result.valid, true);
if (!result.valid) throw new Error("expected valid requirements");
assert.equal(result.regionalWorkload.active, true);
assert.equal(result.regionalWorkload.totalRedirectRps, 120_000);
assert.equal(result.hotKey.active, true);
assert.equal(result.hotKey.viralRedirectRps, 24_000);

const tiny = propagateTraffic({
  architecture: {
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
  },
  challenge: tinyApiChallenge,
  registry: componentRegistry,
});
assert.equal(tiny.valid, true);
if (!tiny.valid) throw new Error("expected valid tiny traffic");
assert.equal(tiny.regionalWorkload.active, false);

console.log("regional workload verified");
