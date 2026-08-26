import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { urlShortenerChallenge } from "@faultline/challenges";
import { validateArchitecture } from "@faultline/core";
import { evaluateRequirements, validateArchitectureForSimulation } from "@faultline/simulator";

import { buildLevel1HeroScene } from "../features/architecture-canvas/level1-hero-scene.ts";

const architecture = buildLevel1HeroScene();

assert.equal(validateArchitecture(architecture).success, true);

const simulationValidation = validateArchitectureForSimulation({
  architecture,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(simulationValidation.valid, true, JSON.stringify(simulationValidation.errors ?? []));

const evaluation = evaluateRequirements({
  architecture,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(evaluation.valid, true);
if (!evaluation.valid) throw new Error("Expected valid hero scene evaluation.");

assert.ok(evaluation.geographicRoutes.length > 0, "hero scene should emit geographic routes");
assert.ok(
  evaluation.geographicRoutes.some((route) => route.originRegion === "europe"),
  "europe origin traffic expected",
);
assert.ok(evaluation.caches["hero-cdn"], "CDN metrics expected");
assert.ok(evaluation.caches["hero-redis"], "Redis metrics expected");
assert.ok(evaluation.services["hero-service-a"], "service-a metrics expected");
assert.ok(evaluation.services["hero-service-b"], "service-b metrics expected");
assert.ok(evaluation.services["hero-service-c"], "service-c metrics expected");

console.log("level 1 hero scene verified");
