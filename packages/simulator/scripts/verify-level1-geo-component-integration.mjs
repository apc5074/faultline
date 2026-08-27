/**
 * CI-06 — Regional runs must preserve ordinary component contracts.
 *
 * This verifier intentionally consumes geo output; it does not define routing
 * policy. GEO scripts remain the source for routing-specific assertions.
 */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "../dist/index.js";
import { createSevenComponentArchitecture, level1CompositionChallenge } from "./fixtures/level1-composition.mjs";

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);
}

function sumRegional(regional, field) {
  return Object.values(regional ?? {}).reduce((total, metrics) => total + metrics[field], 0);
}

function evaluate(architecture) {
  const result = evaluateRequirements({ architecture, challenge: level1CompositionChallenge, registry: componentRegistry });
  assert.equal(result.valid, true, "regional fixture must be simulation-valid");
  return result;
}

console.log("Check — geo run preserves post-absorb component accounting");
const regional = evaluate(createSevenComponentArchitecture({ regional: true }));
assert.equal(regional.regionalWorkload.active, true);
assert.ok(regional.geographicRoutes.length > 0, "geo run emits authoritative routes");
assert.ok(regional.caches.cdn.hitRps > 0, "on-path CDN remains active in geo mode");
assertClose(
  regional.traffic.cdn.incomingRps,
  regional.caches.cdn.hitRps + regional.traffic.service.incomingRps,
  "CDN hit plus regional Service input equals CDN ingress",
);
assertClose(
  sumRegional(regional.regionalTraffic.service, "incomingRps"),
  regional.traffic.service.incomingRps,
  "regional Service traffic reconciles with component traffic",
);
assertClose(
  sumRegional(regional.regionalTraffic.redis, "incomingRps"),
  regional.traffic.redis.incomingRps,
  "regional Redis traffic reconciles with component traffic",
);
assertClose(
  sumRegional(regional.regionalTraffic.postgres, "incomingRps"),
  regional.traffic.postgres.incomingRps,
  "regional Postgres traffic reconciles with component traffic",
);

console.log("Check — deployment capacity and store metrics remain component-truthful");
const service = regional.services.service;
assert.ok(service.regions && service.regions.length === 2, "Service reports each configured deployment");
assertClose(
  service.regions.reduce((total, region) => total + region.incomingRps, 0),
  service.incomingRps,
  "deployment inputs reconcile with Service input",
);
assertClose(service.handledRps + service.unmetRps, service.incomingRps, "Service capacity metrics reconcile in geo mode");
const postgres = regional.postgres.postgres;
assertClose(postgres.readHandledRps + postgres.readCapacityShortfallRps, postgres.readRps, "Postgres reads reconcile in geo mode");
assertClose(postgres.writeHandledRps + postgres.writeCapacityShortfallRps, postgres.writeRps, "Postgres writes reconcile in geo mode");
assertClose(
  postgres.writeRps,
  regional.traffic.service.incomingRps * level1CompositionChallenge.workload.writeRatio,
  "cache layers and geography preserve write demand",
);
assert.ok(regional.caches.redis.hitRps > 0, "regional on-path Redis remains active");
assertClose(
  postgres.readRps,
  regional.traffic.redis.readRps - regional.caches.redis.hitRps,
  "Redis hits reduce only Postgres reads in geo mode",
);

console.log("Check — requirements and costs remain projections of regional component evidence");
const requirementById = new Map(regional.requirements.map((requirement) => [requirement.id, requirement]));
assertClose(requirementById.get("throughput").actual, regional.throughputRatio, "throughput requirement uses regional capacity result");
assertClose(requirementById.get("latency").actual, regional.p95LatencyMs, "latency requirement uses regional path result");
assertClose(requirementById.get("headroom").actual, regional.headroom, "headroom requirement uses regional capacity result");
assertClose(requirementById.get("budget").actual, regional.cost.monthlyTotal, "budget requirement uses regional cost result");
assert.ok(regional.cost.lineItems.some((line) => line.componentId === "cdn" && line.amount > 0));
assert.ok(regional.cost.lineItems.some((line) => line.componentId === "redis" && line.amount > 0));
assert.ok(regional.cost.lineItems.some((line) => line.componentId === "postgres" && line.amount > 0));
assert.ok(regional.events.some((event) => event.type === "traffic_routed" && event.data.originRegion));

console.log("Level 1 geo component integration verified");
