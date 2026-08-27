/**
 * GEO-06 — Postgres primary/replica geographic routing rules.
 *
 * Usage: pnpm --filter @faultline/simulator build && node packages/simulator/scripts/verify-geo-postgres.mjs
 */
import assert from "node:assert/strict";

import { postgresPrimaryReadCapacity } from "@faultline/component-catalog";
import { evaluateHotKeyScenario, evaluateRequirements, propagateTraffic } from "../dist/index.js";
import { componentRegistry } from "@faultline/component-catalog";
import { createSevenComponentArchitecture, level1CompositionChallenge } from "./fixtures/level1-composition.mjs";

function challengeWithHotKey() {
  return {
    ...level1CompositionChallenge,
    workload: {
      ...level1CompositionChallenge.workload,
      requestsPerSecond: 100_000,
      hotKeyReadFraction: 0.5,
    },
  };
}

function run(architecture, challenge = level1CompositionChallenge) {
  const result = propagateTraffic({ architecture, challenge, registry: componentRegistry });
  assert.equal(result.valid, true);
  return result;
}

console.log("Check — ordinary reads use a same-region replica, writes use primary");
const architecture = createSevenComponentArchitecture({ regional: true });
const traffic = run(architecture);
const postgresRoutes = traffic.geographicRoutes.filter((route) => route.componentId === "postgres");
assert.ok(postgresRoutes.some((route) => route.kind === "read" && route.destinationRegion === "europe"));
assert.ok(postgresRoutes.some((route) => route.kind === "read" && route.destinationRegion === "us-east"));
assert.ok(postgresRoutes.every((route) => route.kind !== "write" || route.destinationRegion === "us-east"));
assert.ok(
  postgresRoutes.filter((route) => route.kind === "write").every((route) => route.deploymentId === "postgres-primary"),
  "all writes must target the primary deployment",
);

console.log("Check — moving the replica changes replication transfer placement");
const movedReplica = createSevenComponentArchitecture({ regional: true });
movedReplica.components = movedReplica.components.map((component) =>
  component.id === "postgres"
    ? {
        ...component,
        deployments: component.deployments.map((deployment) =>
          deployment.id === "postgres-europe" ? { ...deployment, regionId: "singapore" } : deployment,
        ),
      }
    : component,
);
const originalRequirements = evaluateRequirements({ architecture, challenge: level1CompositionChallenge, registry: componentRegistry });
const movedRequirements = evaluateRequirements({ architecture: movedReplica, challenge: level1CompositionChallenge, registry: componentRegistry });
assert.equal(originalRequirements.valid, true);
assert.equal(movedRequirements.valid, true);
assert.ok(
  originalRequirements.cost.lineItems.some((line) => line.componentId === "repl:us-east->europe"),
  "remote Europe replica must have replication transfer cost",
);
assert.ok(
  movedRequirements.cost.lineItems.some((line) => line.componentId === "repl:us-east->singapore"),
  "moving the replica must move replication transfer cost",
);

console.log("Check — viral hot-key pressure remains primary-bound");
const hotChallenge = challengeWithHotKey();
const hot = evaluateHotKeyScenario({ architecture, challenge: hotChallenge, registry: componentRegistry });
assert.equal(hot.valid, true);
const postgresHotHop = hot.hotKey.hops.find((hop) => hop.componentId === "postgres");
assert.ok(postgresHotHop);
assert.equal(
  postgresHotHop.hotKeyCapacityRps,
  postgresPrimaryReadCapacity({ tier: "large" }),
  "hot-key capacity must be the primary read capacity, not aggregate replica capacity",
);

console.log("geo Postgres primary/replica rules verified");
