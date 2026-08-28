/** P10-005 — inspector teaching and simulator-evidence labels stay explicit. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../features/architecture-canvas/DataPlateInspector.tsx", import.meta.url),
  "utf8",
);

assert.match(source, /getLevelComponentCard\(/);
assert.match(source, /data-plate-inspector__teaching-label">Role/);
assert.match(source, /DataPlateSection title="Simulator evidence"/);
assert.match(source, /Last Run · simulator evidence/);
assert.match(source, /estimateMonthlyCost\(/);
assert.match(source, /serviceCapacityForConfig\(/);
assert.match(source, /postgresReadCapacityForConfig\(/);
assert.match(source, /cdnThroughputCapacityForConfig\(/);
assert.match(source, /redisEffectiveModel\(/);
assert.doesNotMatch(source, /you must use Redis/i);

console.log("inspector teaching verified");
