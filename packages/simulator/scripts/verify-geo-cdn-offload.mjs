/**
 * GEO-02 — CDN absorb must reduce Service load under geographic routing.
 *
 * Usage: pnpm --filter @faultline/simulator build && node packages/simulator/scripts/verify-geo-cdn-offload.mjs
 */
import assert from "node:assert/strict";

import { urlShortenerChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements, propagateTraffic } from "../dist/index.js";

function architectureWithCdn(cdnConfig) {
  return {
    version: 1,
    components: [
      { id: "t", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: { x: 0, y: 0 } },
      { id: "cdn", type: "cdn", config: cdnConfig, deployments: [], ui: { x: 1, y: 0 } },
      { id: "lb", type: "load-balancer", config: { policy: "equal" }, deployments: [], ui: { x: 2, y: 0 } },
      {
        id: "s1",
        type: "service",
        config: { size: "large", instances: 5 },
        deployments: [{ id: "dep-s1-us", regionId: "us-east", config: { instances: 5 } }],
        ui: { x: 3, y: 0 },
      },
      {
        id: "s2",
        type: "service",
        config: { size: "large", instances: 5 },
        deployments: [{ id: "dep-s2-eu", regionId: "europe", config: { instances: 5 } }],
        ui: { x: 4, y: 0 },
      },
      {
        id: "pg",
        type: "postgres",
        config: { tier: "large", readReplicaCount: 1 },
        deployments: [],
        ui: { x: 5, y: 0 },
      },
    ],
    connections: [
      {
        id: "e1",
        sourceComponentId: "t",
        sourcePortId: "request_out",
        targetComponentId: "cdn",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e2",
        sourceComponentId: "cdn",
        sourcePortId: "origin_out",
        targetComponentId: "lb",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e3",
        sourceComponentId: "lb",
        sourcePortId: "request_out",
        targetComponentId: "s1",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e4",
        sourceComponentId: "lb",
        sourcePortId: "request_out",
        targetComponentId: "s2",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e5",
        sourceComponentId: "s1",
        sourcePortId: "database_out",
        targetComponentId: "pg",
        targetPortId: "database_in",
        type: "read_write",
      },
      {
        id: "e6",
        sourceComponentId: "s2",
        sourcePortId: "database_out",
        targetComponentId: "pg",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
}

function architectureWithoutCdn() {
  const base = architectureWithCdn({ coverage: 1, ttlBand: "long", tier: "large" });
  return {
    ...base,
    components: base.components.filter((component) => component.id !== "cdn"),
    connections: [
      {
        id: "e1",
        sourceComponentId: "t",
        sourcePortId: "request_out",
        targetComponentId: "lb",
        targetPortId: "request_in",
        type: "request",
      },
      ...base.connections.filter((connection) => connection.id !== "e1" && connection.id !== "e2"),
    ],
  };
}

function serviceIncomingTotal(result) {
  return Object.values(result.services).reduce((sum, metrics) => sum + metrics.incomingRps, 0);
}

console.log("Check — strong CDN + regional Services: Service load ≈ miss+writes, not full demand");
const strongArch = architectureWithCdn({ coverage: 1, ttlBand: "long", tier: "large" });
const strong = evaluateRequirements({
  architecture: strongArch,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(strong.valid, true);
const strongServiceIn = serviceIncomingTotal(strong);
const expectedForward = strong.traffic.cdn.incomingRps - strong.caches.cdn.hitRps;
assert.ok(strong.caches.cdn.hitRps > 50_000, "strong CDN should absorb most redirects");
assert.ok(
  Math.abs(strongServiceIn - expectedForward) < 1,
  `Service incoming (${strongServiceIn}) should equal CDN forward (${expectedForward})`,
);
assert.ok(strongServiceIn < 50_000, "Service load must be miss-scale, not ~124k");

console.log("Check — no CDN control: Services see full demand");
const none = evaluateRequirements({
  architecture: architectureWithoutCdn(),
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(none.valid, true);
const noneServiceIn = serviceIncomingTotal(none);
assert.ok(
  Math.abs(noneServiceIn - urlShortenerChallenge.workload.requestsPerSecond) < 1,
  `without CDN, Service incoming (${noneServiceIn}) should be full demand`,
);

console.log("Check — weaker CDN absorbs less than strong edge CDN");
const weakArch = architectureWithCdn({ coverage: 0.4, ttlBand: "short", tier: "small" });
const weak = evaluateRequirements({
  architecture: weakArch,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(weak.valid, true);
const weakServiceIn = serviceIncomingTotal(weak);
assert.ok(
  weakServiceIn > strongServiceIn + 1_000,
  `weak CDN Service load (${weakServiceIn}) should exceed strong (${strongServiceIn})`,
);
assert.ok(weak.caches.cdn.hitRps < strong.caches.cdn.hitRps);

console.log("Check — propagateTraffic geo flag still active with deployments");
const propagated = propagateTraffic({
  architecture: strongArch,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(propagated.valid, true);
assert.ok(propagated.geographicRoutes.length > 0);

console.log("geo CDN offload verified");
