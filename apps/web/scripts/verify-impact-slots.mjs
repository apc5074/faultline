import assert from "node:assert/strict";

import {
  impactSlotSeed,
  randomizedImpactSlots,
} from "../features/traffic-playback/impact-slots.ts";

const seed = impactSlotSeed({
  runId: "baseline-001",
  componentId: "redis-primary",
  sequence: 4,
});
const first = randomizedImpactSlots(8, seed);
const replay = randomizedImpactSlots(8, seed);

assert.deepEqual(replay, first, "the same simulator event must replay identically");
assert.deepEqual([...first].sort((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6, 7]);
assert.notDeepEqual(
  randomizedImpactSlots(8, impactSlotSeed({ runId: "baseline-001", componentId: "redis-primary", sequence: 5 })),
  first,
  "separate events should vary their cosmetic impact placement",
);
assert.deepEqual(randomizedImpactSlots(0, seed), []);
assert.throws(() => randomizedImpactSlots(-1, seed), /non-negative safe integer/);

console.log("seeded impact slots verified");
