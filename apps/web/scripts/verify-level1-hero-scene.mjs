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

assert.ok(evaluation.caches["hero-cdn"], "CDN metrics expected");
assert.ok(evaluation.services["hero-service"], "service metrics expected");
assert.ok(evaluation.postgres["hero-postgres"], "postgres metrics expected");

for (const requirement of evaluation.requirements) {
  assert.equal(
    requirement.passed,
    true,
    `${requirement.id} should pass: ${requirement.explanation}`,
  );
}
assert.equal(evaluation.hotKey?.passed, true, evaluation.hotKey?.explanation);

console.log("level 1 hero scene verified (requirements pass)");
