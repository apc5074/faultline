/**
 * LP-04 — inherited MVP starter from Level Profile (fail-first, not hero).
 *
 * Usage: pnpm --filter @faultline/web verify:level1-starter
 */
import assert from "node:assert/strict";

import {
  getLevelCurriculum,
  getLevelStarterArchitecture,
  urlShortenerChallenge,
  urlShortenerStarterArchitecture,
} from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import { validateArchitecture } from "@faultline/core";
import {
  evaluateRequirements,
  validateArchitectureForSimulation,
} from "@faultline/simulator";

import {
  buildLevel1HeroScene,
  isLevel1HeroSceneEnabled,
} from "../features/architecture-canvas/level1-hero-scene.ts";

const starter = urlShortenerStarterArchitecture();
assert.deepEqual(starter, getLevelStarterArchitecture("url-shortener"));

assert.equal(validateArchitecture(starter).success, true);

const service = starter.components.find((component) => component.id === "service-start");
const postgres = starter.components.find((component) => component.id === "postgres-start");
assert.ok(service);
assert.ok(postgres);
assert.equal(service.config.size, "medium");
assert.equal(service.config.instances, 3);
assert.equal(service.deployments[0]?.regionId, "us-east");
assert.equal(service.deployments[0]?.config.instances, 3);
assert.equal(postgres.config.tier, "medium");
assert.equal(postgres.config.readReplicaCount, 0);

for (const component of starter.components) {
  assert.ok(component.ui && typeof component.ui.x === "number" && typeof component.ui.y === "number");
  assert.ok(!(component.ui.x === 0 && component.ui.y === 0), `${component.id} should not sit on origin`);
}

const simulationValidation = validateArchitectureForSimulation({
  architecture: starter,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(simulationValidation.valid, true, JSON.stringify(simulationValidation.errors ?? []));

const evaluation = evaluateRequirements({
  architecture: starter,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(evaluation.valid, true);

const curriculum = getLevelCurriculum("url-shortener");
for (const requirementId of curriculum.expectedFailingRequirementIds) {
  const requirement = evaluation.requirements.find((entry) => entry.id === requirementId);
  assert.ok(requirement, `missing requirement ${requirementId}`);
  assert.equal(requirement.passed, false, `${requirementId} should fail on inherited MVP`);
}
assert.equal(evaluation.hotKey?.passed, false, evaluation.hotKey?.explanation ?? "hot-key should fail");

const hero = buildLevel1HeroScene();
assert.notEqual(
  JSON.stringify(starter.components.map((c) => c.id).sort()),
  JSON.stringify(hero.components.map((c) => c.id).sort()),
  "starter must not be the hero scene",
);

const previousHeroFlag = process.env.NEXT_PUBLIC_FAULTLINE_HERO_SCENE;
delete process.env.NEXT_PUBLIC_FAULTLINE_HERO_SCENE;
assert.equal(
  isLevel1HeroSceneEnabled(),
  false,
  "default playground path must use profile starter, not hero",
);
if (previousHeroFlag !== undefined) process.env.NEXT_PUBLIC_FAULTLINE_HERO_SCENE = previousHeroFlag;

console.log("level 1 starter verified (inherited MVP fails requirements)");
