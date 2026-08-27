/** GEO-12 — inspector copy teaches geo leverage without inventing guarantees. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../features/architecture-canvas/DataPlateInspector.tsx", import.meta.url), "utf8");
assert.match(source, /Needs regional Services to steer post-CDN miss traffic to the nearest/);
assert.match(source, /Splits post-CDN miss traffic evenly across connected services/);
assert.match(source, /One connected Service gives the balancer no fan-out leverage/);
assert.match(source, /Failure experiments provide simulated evidence/);
assert.doesNotMatch(source, /health-aware redistribution comes with failure injection/);

console.log("geo inspector teaching verified");
