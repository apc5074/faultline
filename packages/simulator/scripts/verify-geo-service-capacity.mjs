/**
 * GEO-04 — Service per-deployment capacity under post-CDN / post-LB load.
 *
 * Usage: pnpm --filter @faultline/simulator build && node packages/simulator/scripts/verify-geo-service-capacity.mjs
 */
import assert from "node:assert/strict";

import { urlShortenerChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "../dist/index.js";

function cdnServicePostgres(deployments) {
  const instances = deployments.reduce((sum, deployment) => sum + deployment.config.instances, 0);
  return {
    version: 1,
    components: [
      { id: "t", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: { x: 0, y: 0 } },
      { id: "cdn", type: "cdn", config: { coverage: 1, ttlBand: "long", tier: "large" }, deployments: [], ui: { x: 1, y: 0 } },
      {
        id: "svc",
        type: "service",
        config: { size: "large", instances },
        deployments,
        ui: { x: 2, y: 0 },
      },
      { id: "pg", type: "postgres", config: { tier: "large", readReplicaCount: 1 }, deployments: [], ui: { x: 3, y: 0 } },
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
        targetComponentId: "svc",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e3",
        sourceComponentId: "svc",
        sourcePortId: "database_out",
        targetComponentId: "pg",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
}

/** Lean geo passer: CDN + nearest-healthy across two regional Service pools (≤$85k). */
function leanGeoPasser() {
  return {
    version: 1,
    components: [
      { id: "t", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: { x: 0, y: 0 } },
      { id: "cdn", type: "cdn", config: { coverage: 1, ttlBand: "long", tier: "large" }, deployments: [], ui: { x: 1, y: 0 } },
      {
        id: "s-a",
        type: "service",
        config: { size: "large", instances: 10 },
        deployments: [
          { id: "a-us", regionId: "us-east", config: { instances: 5 } },
          { id: "a-sg", regionId: "singapore", config: { instances: 5 } },
        ],
        ui: { x: 2, y: -1 },
      },
      {
        id: "s-b",
        type: "service",
        config: { size: "large", instances: 10 },
        deployments: [
          { id: "b-eu", regionId: "europe", config: { instances: 5 } },
          { id: "b-west", regionId: "us-west", config: { instances: 5 } },
        ],
        ui: { x: 2, y: 1 },
      },
      { id: "pg", type: "postgres", config: { tier: "large", readReplicaCount: 1 }, deployments: [], ui: { x: 3, y: 0 } },
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
        targetComponentId: "s-a",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e3",
        sourceComponentId: "cdn",
        sourcePortId: "origin_out",
        targetComponentId: "s-b",
        targetPortId: "request_in",
        type: "request",
      },
      {
        id: "e4",
        sourceComponentId: "s-a",
        sourcePortId: "database_out",
        targetComponentId: "pg",
        targetPortId: "database_in",
        type: "read_write",
      },
      {
        id: "e5",
        sourceComponentId: "s-b",
        sourcePortId: "database_out",
        targetComponentId: "pg",
        targetPortId: "database_in",
        type: "read_write",
      },
    ],
  };
}

console.log("Check — hot-region saturation with healthy global instance sum");
const hot = evaluateRequirements({
  architecture: cdnServicePostgres([
    { id: "dep-us", regionId: "us-east", config: { instances: 1 } },
    { id: "dep-eu", regionId: "europe", config: { instances: 9 } },
  ]),
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(hot.valid, true);
const hotSvc = hot.services.svc;
assert.ok(hotSvc.incomingRps < 50_000, "Service load must be post-CDN miss volume, not ~124k");
assert.equal(hotSvc.capacityRps, 40_000, "global capacity remains large×10");
assert.ok(hotSvc.unmetRps > 1_000, "hot nearest region must leave unmet demand");
assert.equal(hotSvc.state, "saturated");
const hotUs = hotSvc.regions?.find((region) => region.regionId === "us-east");
assert.ok(hotUs && hotUs.utilization > 1, "us-east deployment must be over capacity");
assert.ok(hotSvc.headroom < 0, "headroom must reflect worst region, not global pool");
assert.ok(hot.throughputRatio < 1, "throughput must use truthful regional handled share");
assert.equal(hot.requirements.find((requirement) => requirement.id === "headroom")?.passed, false);

console.log("Check — spreading instances toward origins clears local saturation");
const spread = evaluateRequirements({
  architecture: cdnServicePostgres([
    { id: "dep-us", regionId: "us-east", config: { instances: 5 } },
    { id: "dep-eu", regionId: "europe", config: { instances: 5 } },
  ]),
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(spread.valid, true);
assert.equal(spread.services.svc.unmetRps, 0);
assert.ok(spread.services.svc.headroom > hotSvc.headroom);
assert.ok(spread.services.svc.utilization < 1);

console.log("Check — lean geo passer: CDN + regional spread + headroom ≥20%");
const lean = evaluateRequirements({
  architecture: leanGeoPasser(),
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(lean.valid, true);
assert.equal(lean.allRequirementsPass, true);
assert.ok(lean.headroom >= 0.2, `lean headroom ${lean.headroom} must be ≥20%`);
assert.ok(lean.cost.monthlyTotal <= 85_000, `lean cost ${lean.cost.monthlyTotal} must stay ≤$85k`);
assert.equal(lean.hotKey.passed, true);
assert.ok(lean.caches.cdn.hitRps > 50_000, "lean passer still relies on CDN absorb");
assert.ok(
  Object.values(lean.services).every((service) => service.incomingRps < 40_000),
  "lean Service pools see miss-scale load",
);

console.log("geo service capacity verified");
