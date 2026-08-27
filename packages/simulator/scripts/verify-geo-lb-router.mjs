/**
 * GEO-03 — Global Router + Load Balancer compose on the post-CDN miss path.
 *
 * Rule: miss RPS → LB allocates across Service component IDs by policy → each
 * share binds to that Service’s nearest healthy deployment for the origin.
 *
 * Usage: pnpm --filter @faultline/simulator build && node packages/simulator/scripts/verify-geo-lb-router.mjs
 */
import assert from "node:assert/strict";

import { urlShortenerChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements, propagateTraffic } from "../dist/index.js";

const challenge = {
  ...urlShortenerChallenge,
  allowedComponentTypes: [
    ...new Set([...urlShortenerChallenge.allowedComponentTypes, "load-balancer", "global-router", "cdn"]),
  ],
};

function baseComponents(policy) {
  return [
    { id: "t", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "cdn", type: "cdn", config: { coverage: 1, ttlBand: "long", tier: "large" }, deployments: [], ui: { x: 1, y: 0 } },
    { id: "lb", type: "load-balancer", config: { policy }, deployments: [], ui: { x: 3, y: 0 } },
    {
      id: "s-small",
      type: "service",
      config: { size: "large", instances: 2 },
      deployments: [{ id: "dep-small-us", regionId: "us-east", config: { instances: 2 } }],
      ui: { x: 4, y: -1 },
    },
    {
      id: "s-large",
      type: "service",
      config: { size: "large", instances: 6 },
      deployments: [{ id: "dep-large-eu", regionId: "europe", config: { instances: 6 } }],
      ui: { x: 4, y: 1 },
    },
    {
      id: "pg",
      type: "postgres",
      config: { tier: "large", readReplicaCount: 1 },
      deployments: [],
      ui: { x: 5, y: 0 },
    },
  ];
}

function architectureCdnLb(policy) {
  return {
    version: 1,
    components: baseComponents(policy),
    connections: [
      {
        id: "e-t-cdn",
        sourceComponentId: "t",
        sourcePortId: "request_out",
        targetComponentId: "cdn",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e-cdn-lb",
        sourceComponentId: "cdn",
        sourcePortId: "origin_out",
        targetComponentId: "lb",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e-lb-small",
        sourceComponentId: "lb",
        sourcePortId: "request_out",
        targetComponentId: "s-small",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e-lb-large",
        sourceComponentId: "lb",
        sourcePortId: "request_out",
        targetComponentId: "s-large",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e-small-pg",
        sourceComponentId: "s-small",
        sourcePortId: "database_out",
        targetComponentId: "pg",
        targetPortId: "database_in",
        type: "read_write",
      },
      {
        id: "e-large-pg",
        sourceComponentId: "s-large",
        sourcePortId: "database_out",
        targetComponentId: "pg",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
}

function architectureWithRouter(policy) {
  const base = architectureCdnLb(policy);
  return {
    ...base,
    components: [
      ...base.components.slice(0, 2),
      { id: "router", type: "global-router", config: {}, deployments: [], ui: { x: 2, y: 0 } },
      ...base.components.slice(2),
    ],
    connections: [
      base.connections[0],
      {
        id: "e-cdn-router",
        sourceComponentId: "cdn",
        sourcePortId: "origin_out",
        targetComponentId: "router",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e-router-lb",
        sourceComponentId: "router",
        sourcePortId: "route_out",
        targetComponentId: "lb",
        targetPortId: "request_in",
        type: "request",
      },
      ...base.connections.slice(2),
    ].filter((connection) => connection.id !== "e-cdn-lb"),
  };
}

console.log("Check — equal LB + CDN + regional Services: ~50/50 miss split");
const equalArch = architectureCdnLb("equal");
const equal = evaluateRequirements({
  architecture: equalArch,
  challenge,
  registry: componentRegistry,
});
assert.equal(equal.valid, true);
const equalForward = equal.traffic.cdn.incomingRps - equal.caches.cdn.hitRps;
assert.ok(equalForward > 0);
assert.ok(Math.abs(equal.traffic.lb.incomingRps - equalForward) < 1, "LB sees post-CDN miss volume");
assert.ok(
  Math.abs(equal.traffic["s-small"].incomingRps - equalForward / 2) < 1,
  `equal small share: ${equal.traffic["s-small"].incomingRps} vs ${equalForward / 2}`,
);
assert.ok(
  Math.abs(equal.traffic["s-large"].incomingRps - equalForward / 2) < 1,
  `equal large share: ${equal.traffic["s-large"].incomingRps} vs ${equalForward / 2}`,
);
assert.ok(
  Math.abs(equal.traffic["s-small"].incomingRps + equal.traffic["s-large"].incomingRps - equalForward) < 1,
  "Service totals equal miss volume (no double-count)",
);

console.log("Check — capacity_weighted LB under geo + CDN");
const weighted = evaluateRequirements({
  architecture: architectureCdnLb("capacity_weighted"),
  challenge,
  registry: componentRegistry,
});
assert.equal(weighted.valid, true);
const weightedForward = weighted.traffic.cdn.incomingRps - weighted.caches.cdn.hitRps;
assert.ok(
  Math.abs(
    weighted.traffic["s-small"].incomingRps + weighted.traffic["s-large"].incomingRps - weightedForward,
  ) < 1,
  "weighted Service totals equal miss volume",
);
assert.ok(
  weighted.traffic["s-large"].incomingRps > weighted.traffic["s-small"].incomingRps,
  "capacity_weighted must favor the larger Service",
);
assert.ok(
  weighted.traffic["s-large"].incomingRps > equal.traffic["s-large"].incomingRps,
  "capacity_weighted large share must exceed equal 50/50",
);
assert.ok(
  weighted.traffic["s-small"].incomingRps < equal.traffic["s-small"].incomingRps,
  "capacity_weighted small share must be below equal 50/50",
);

console.log("Check — Router passthrough does not invent edges or duplicate RPS");
const withRouter = evaluateRequirements({
  architecture: architectureWithRouter("equal"),
  challenge,
  registry: componentRegistry,
});
assert.equal(withRouter.valid, true);
const routerForward = withRouter.traffic.cdn.incomingRps - withRouter.caches.cdn.hitRps;
assert.ok(Math.abs(withRouter.traffic.router.incomingRps - routerForward) < 1);
assert.ok(Math.abs(withRouter.traffic.lb.incomingRps - routerForward) < 1);
assert.ok(Math.abs(withRouter.traffic["s-small"].incomingRps - routerForward / 2) < 1);
assert.ok(Math.abs(withRouter.traffic["s-large"].incomingRps - routerForward / 2) < 1);
assert.ok(
  Math.abs(withRouter.traffic["s-small"].incomingRps - equal.traffic["s-small"].incomingRps) < 1,
  "adding Router must not change Service split vs CDN→LB",
);

console.log("Check — single LB outbound edge has no fan-out leverage");
const single = propagateTraffic({
  architecture: {
    version: 1,
    components: [
      { id: "t", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: { x: 0, y: 0 } },
      { id: "lb", type: "load-balancer", config: { policy: "equal" }, deployments: [], ui: { x: 1, y: 0 } },
      {
        id: "s1",
        type: "service",
        config: { size: "large", instances: 5 },
        deployments: [{ id: "dep-s1", regionId: "us-east", config: { instances: 5 } }],
        ui: { x: 2, y: 0 },
      },
      {
        id: "pg",
        type: "postgres",
        config: { tier: "large" },
        deployments: [],
        ui: { x: 3, y: 0 },
      },
    ],
    connections: [
      {
        id: "e1",
        sourceComponentId: "t",
        sourcePortId: "request_out",
        targetComponentId: "lb",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e2",
        sourceComponentId: "lb",
        sourcePortId: "request_out",
        targetComponentId: "s1",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e3",
        sourceComponentId: "s1",
        sourcePortId: "database_out",
        targetComponentId: "pg",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  },
  challenge,
  registry: componentRegistry,
});
assert.equal(single.valid, true);
assert.ok(
  Math.abs(single.traffic.s1.incomingRps - challenge.workload.requestsPerSecond) < 1,
  "single outbound LB edge forwards full demand",
);

console.log("geo LB/Router miss-path verified");
