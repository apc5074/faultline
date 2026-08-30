/** P10-011 — WebMCP remains discoverable, optional, and aligned with coaching policy. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const status = await readFile(
  new URL("../features/webmcp/WebMcpStatusPlate.tsx", import.meta.url),
  "utf8",
);
const docs = await readFile(new URL("../../../docs/WEBMCP.md", import.meta.url), "utf8");
const workspace = await readFile(
  new URL("../features/architecture-canvas/ArchitectureCanvas.tsx", import.meta.url),
  "utf8",
);

assert.match(status, /Starter prompts/);
assert.match(status, /get_coaching_policy first/);
assert.match(status, /get_session_focus/);
assert.match(status, /one finding and one question/);
assert.match(status, /Optional — your game works without WebMCP/);
assert.match(status, /https:\/\/webmcp\.dev/);
assert.doesNotMatch(status, /edit.*architecture|submit/i);
assert.match(status, /read.*visual.*simulated/);
assert.match(status, /Agent tools disabled/);
assert.match(workspace, /playground-topbar__agent-status/);
assert.match(docs, /get_coaching_policy.*Call first/s);
assert.match(docs, /WebMCP is not an architecture editing API/);

console.log("WebMCP polish verified");
