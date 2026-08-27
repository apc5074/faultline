/** GEO-13 — Traffic Source origin copy distinguishes estimates from truth. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../features/architecture-canvas/DataPlateInspector.tsx", import.meta.url), "utf8");
assert.match(source, /Ballpark challenge demand by user region/);
assert.match(source, /not simulator evidence/);
assert.match(source, /World map arcs are the\s+authoritative paths/);
assert.match(source, /regional capacity/);

console.log("geo origin teaching verified");
