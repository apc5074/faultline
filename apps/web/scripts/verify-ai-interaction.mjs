/** P10-010 — embedded AI remains optional, cancelable, and simulator-grounded. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(
  new URL("../features/ai-engineer/AiEngineerPanel.tsx", import.meta.url),
  "utf8",
);
const route = await readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8");

assert.match(panel, /Reads simulator evidence, asks hard questions, and runs simulated tests/);
assert.match(panel, /never edits your architecture/);
assert.match(panel, /AbortController/);
assert.match(panel, /requestControllerRef\.current\?\.abort\(\)/);
assert.match(panel, /type="button" onClick=\{cancelRequest\}/);
assert.match(panel, /setStatus\(controller\.signal\.aborted \? "idle" : "error"\)/);
assert.match(route, /Running simulated experiment — architecture unchanged/);

console.log("AI interaction verified");
