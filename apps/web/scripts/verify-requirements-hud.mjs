/** P10-007 — requirement failures remain explicit, measured, and baseline-labelled. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../features/architecture-canvas/PlaygroundHudPlates.tsx", import.meta.url),
  "utf8",
);

assert.match(source, /Baseline simulator evidence/);
assert.match(source, /STALE — architecture changed; run again for current truth/);
assert.match(source, /failedCount/);
assert.match(source, /evaluated\.explanation/);
assert.match(source, /result\.hotKey\.explanation/);
assert.match(source, /workloadChannels/);
assert.match(source, /channels\.length === 0/);
assert.doesNotMatch(source, /you must use Redis/i);

console.log("requirements HUD verified");
