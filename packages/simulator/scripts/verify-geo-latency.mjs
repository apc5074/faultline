/**
 * GEO-07 — Geographic p95 uses actual post-absorb routes.
 *
 * Usage: pnpm --filter @faultline/simulator build && node packages/simulator/scripts/verify-geo-latency.mjs
 */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { evaluatePathLatency } from "../dist/index.js";
import { createSevenComponentArchitecture, level1CompositionChallenge } from "./fixtures/level1-composition.mjs";

function evaluate(architecture) {
  const result = evaluatePathLatency({ architecture, challenge: level1CompositionChallenge, registry: componentRegistry });
  assert.equal(result.valid, true);
  return result;
}

console.log("Check — strong CDN keeps geo p95 below the Level 1 target");
const withCdn = evaluate(createSevenComponentArchitecture({ regional: true }));
assert.ok(withCdn.geographicOriginLatencies?.length);
assert.ok(withCdn.p95LatencyMs < 150, `geo CDN p95 ${withCdn.p95LatencyMs} must stay below 150ms`);
assert.ok(withCdn.traffic.service.incomingRps < withCdn.traffic.cdn.incomingRps);

console.log("Check — removing CDN worsens the multi-origin geo path");
const withoutCdnArchitecture = createSevenComponentArchitecture({ regional: true });
withoutCdnArchitecture.components = withoutCdnArchitecture.components.filter((component) => component.id !== "cdn");
withoutCdnArchitecture.connections = withoutCdnArchitecture.connections
  .filter((connection) => !["traffic-cdn", "cdn-router"].includes(connection.id));
withoutCdnArchitecture.connections.push({
  id: "traffic-router",
  sourceComponentId: "traffic",
  sourcePortId: "request_out",
  targetComponentId: "router",
  targetPortId: "request_in",
  type: "request",
});
// Keep one stable source→router edge after removing the CDN.
withoutCdnArchitecture.connections = withoutCdnArchitecture.connections.filter(
  (connection, index, connections) => connections.findIndex((candidate) => candidate.id === connection.id) === index,
);
const withoutCdn = evaluate(withoutCdnArchitecture);
assert.ok(withoutCdn.p95LatencyMs > withCdn.p95LatencyMs, "CDN removal must worsen geo p95");

console.log("Check — Redis hits skip downstream Postgres processing and RTT");
const cachedOrigin = withCdn.geographicOriginLatencies?.find((origin) => origin.originRegion === "europe");
assert.ok(cachedOrigin);
assert.ok(cachedOrigin.cacheHitRate > 0);
assert.ok(cachedOrigin.postgresLatencyMs < withCdn.components.postgres.p95LatencyMs);

console.log("geo latency verified");
