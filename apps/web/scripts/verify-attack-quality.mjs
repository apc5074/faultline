/** P10-012 — supported attacks expose hypotheses and simulator evidence without mutating architecture. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(
  new URL("../features/experiments/ExperimentResultPanel.tsx", import.meta.url),
  "utf8",
);
const controls = await readFile(
  new URL("../features/experiments/DevExperimentControls.tsx", import.meta.url),
  "utf8",
);

assert.match(panel, /test question/);
assert.match(panel, /limiting simulator evidence/);
assert.match(panel, /result\.outcome\.requirements\.filter/);
assert.match(panel, /simulated · non-persistent/);
assert.match(panel, /no automatic repair/);
assert.match(panel, /authoritative surviving routes/);
assert.match(panel, /stale — architecture changed; rerun/);
assert.match(controls, /simulated only/);
assert.match(controls, /evaluateExperiment/);
assert.match(controls, /unavailableReason/);
assert.doesNotMatch(panel, /must use|canonical topology|auto.?fix/i);

console.log("attack quality verified");
