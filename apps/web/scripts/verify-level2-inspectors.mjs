import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const inspector = await readFile(new URL("../features/architecture-canvas/DataPlateInspector.tsx", import.meta.url), "utf8");
const rail = await readFile(new URL("../features/architecture-canvas/ComponentRail.tsx", import.meta.url), "utf8");

for (const type of ["queue", "worker", "object-storage"]) {
  assert.match(inspector, new RegExp(`component\.type === [\\\"']${type}[\\\"']`));
  assert.match(rail, new RegExp(`\\b${type.replace("-", "-")}\\b`));
}
assert.match(inspector, /queueCapacityTiers/);
assert.match(inspector, /workerSizeModels/);
assert.match(inspector, /objectStorageTierModels/);
assert.match(rail, /"Async"/);

console.log("Level 2 inspectors and rail verified");
