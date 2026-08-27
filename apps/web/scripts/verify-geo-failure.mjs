/** GEO-17 — simulated region-failure identity wiring. */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { evaluateExperiment } from "@faultline/simulator";
import {
  createSevenComponentArchitecture,
  level1CompositionChallenge,
} from "../../../packages/simulator/scripts/fixtures/level1-composition.mjs";

import { regionFailurePresentationFromEvents } from "../features/world-map/region-failure-presentation.ts";

const architecture = createSevenComponentArchitecture({ regional: true });

const failure = evaluateExperiment({
  architecture,
  challenge: level1CompositionChallenge,
  registry: componentRegistry,
  experiment: { type: "region_failure", parameters: { regionId: "us-east" } },
});
assert.equal(failure.ok, true);
if (!failure.ok) throw new Error("expected regional failure experiment");
const failureTypes = failure.data.events.map((event) => event.type);
assert.ok(failureTypes.includes("region_failed"));
assert.ok(!failureTypes.includes("component_failed"), "region failure must not invent component failure events");
assert.ok(!failureTypes.includes("failover"), "region failure must not invent failover theater");

const presentation = regionFailurePresentationFromEvents(failure.data.events);
assert.deepEqual(presentation?.failedRegionIds, ["us-east"]);
assert.deepEqual(presentation?.failedComponentIds, []);
assert.ok(presentation?.databaseUnavailableRegionIds.includes("us-east"));

console.log("geo failure hooks verified");
