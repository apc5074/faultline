/** GEO-13 — Traffic Source origin copy distinguishes estimates from truth. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../features/architecture-canvas/DataPlateInspector.tsx", import.meta.url), "utf8");
assert.match(source, /Approximate demand by region/);
assert.match(source, /not simulator evidence/);
assert.match(source, /world map arcs show the\s+authoritative paths/);

console.log("geo origin teaching verified");
