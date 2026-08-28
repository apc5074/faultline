/** GEO-15 — World Map arcs are simulator routes and reconcile with Service miss load. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { componentRegistry } from "@faultline/component-catalog";
import { propagateTraffic } from "@faultline/simulator";
import { createSevenComponentArchitecture, level1CompositionChallenge } from "../../../packages/simulator/scripts/fixtures/level1-composition.mjs";
import { aggregateRoutes } from "../features/world-map/geo-route-aggregation.ts";

const mapSource = await readFile(new URL("../features/world-map/WorldMap.tsx", import.meta.url), "utf8");
assert.match(mapSource, /challenge origin share/);
assert.match(mapSource, /simulator route · weight = rps/);
assert.match(mapSource, /Run simulation to show simulator routes/);
assert.match(mapSource, /routesActive \? aggregateRoutes\(geographicRoutes\) : \[\]/);

const architecture = createSevenComponentArchitecture({ regional: true });
const result = propagateTraffic({ architecture, challenge: level1CompositionChallenge, registry: componentRegistry });
assert.equal(result.valid, true);
if (!result.valid) throw new Error("expected valid geo simulation");

const arcs = aggregateRoutes(result.geographicRoutes);
const requestArcRps = arcs
  .filter((arc) => arc.kind === "request")
  .reduce((sum, arc) => sum + arc.rps, 0);
assert.ok(Math.abs(requestArcRps - result.traffic.service.incomingRps) < 1e-6);
assert.ok(arcs.every((arc) => arc.rps > 0));
assert.ok(arcs.every((arc) => arc.componentIds.length > 0 && arc.deploymentIds.length > 0));

const logical = propagateTraffic({
  architecture: createSevenComponentArchitecture(),
  challenge: level1CompositionChallenge,
  registry: componentRegistry,
});
assert.equal(logical.valid, true);
if (!logical.valid) throw new Error("expected valid logical simulation");
assert.equal(aggregateRoutes(logical.geographicRoutes).length, 0);

console.log("geo world map arcs verified");
