/** GEO-14 — Postgres/Redis regional controls teach simulator constraints. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../features/architecture-canvas/DataPlateInspector.tsx", import.meta.url), "utf8");
assert.match(source, /Primary zone \(writes\)/);
assert.match(source, /Replica regions \(reads\)/);
assert.match(source, /One primary handles writes/);
assert.match(source, /Replicas add reads and must match the\s+configured count/);
assert.match(source, /invalid placements are rejected with no\s+auto-promotion/);
assert.match(source, /Each checked region is an independent Redis cache/);
assert.match(source, /not cross-region sync/);
assert.match(source, /logical single-cache path/);

console.log("geo store controls verified");
