/** GEO-12 — inspector copy teaches geo leverage without inventing guarantees. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../features/architecture-canvas/DataPlateInspector.tsx", import.meta.url), "utf8");
assert.match(source, /Needs regional Services to steer post-CDN miss traffic to the nearest/);
assert.match(source, /Splits post-CDN miss traffic evenly across connected services/);
assert.match(source, /One connected Service gives the balancer no fan-out leverage/);
assert.match(source, /Failure experiments provide simulated evidence/);
assert.doesNotMatch(source, /health-aware redistribution comes with failure injection/);

assert.match(source, /Approximate demand by region/);
assert.match(source, /not simulator evidence/);
assert.match(source, /world map arcs show the\s+authoritative paths/);

assert.match(source, /Primary zone \(writes\)/);
assert.match(source, /Replica regions \(reads\)/);
assert.match(source, /One primary handles writes/);
assert.match(source, /Replicas add reads and must match the\s+configured count/);
assert.match(source, /invalid placements are rejected with no\s+auto-promotion/);
assert.match(source, /Each checked region is an independent Redis cache/);
assert.match(source, /not cross-region sync/);
assert.match(source, /logical single-cache path/);

console.log("geo inspector teaching, origins, and store controls verified");
