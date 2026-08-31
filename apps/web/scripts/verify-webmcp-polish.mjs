/** P10-011 — WebMCP remains discoverable, optional, and aligned with coaching policy. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const status = await readFile(
  new URL("../features/webmcp/WebMcpStatusPlate.tsx", import.meta.url),
  "utf8",
);
const docs = await readFile(new URL("../../../docs/WEBMCP.md", import.meta.url), "utf8");
const architectureWorkspace = await readFile(
  new URL("../features/architecture-canvas/ArchitectureCanvas.tsx", import.meta.url),
  "utf8",
);
const registration = await readFile(
  new URL("../features/webmcp/WebMcpRegistration.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = await readFile(
  new URL("../features/architecture-canvas/usePlaygroundWorkspace.ts", import.meta.url),
  "utf8",
);

assert.match(status, /Starter prompts/);
assert.match(status, /review_current_design/);
assert.match(status, /Retry WebMCP/);
assert.match(status, /one finding and one question/);
assert.match(status, /Optional — your game works without WebMCP/);
assert.match(status, /href="\/webmcp"/);
assert.doesNotMatch(status, /edit.*architecture|submit/i);
assert.doesNotMatch(status, /read.*visual.*simulated/);
assert.match(status, /Agent tools disabled/);
assert.match(architectureWorkspace, /playground-topbar__agent-status/);
assert.match(registration, /WEBMCP_REGISTRATION_DEADLINE_MS/);
assert.match(registration, /publishedStatusRef/);
assert.match(registration, /return current/);
assert.match(registration, /result\.resolvedToolNames\.length === 0/);
assert.doesNotMatch(registration, /!active \|\| timedOut/);
assert.doesNotMatch(registration, /active && !timedOut/);
assert.match(docs, /review_current_design/);
assert.match(docs, /WebMCP is not an architecture editing API/);
assert.match(docs, /targeted grounded reads frame their validated component or bounded path/);
assert.match(docs, /rapid successive answers/);
assert.match(workspaceSource, /spotlightPresentationCue/);
assert.match(workspaceSource, /attentionConnectionIds/);
assert.match(workspaceSource, /pendingCameraRef/);
assert.match(workspaceSource, /frame-path/);
assert.match(workspaceSource, /componentIds\.map\(\(id\) => \(\{ id \}\)\)/);
assert.match(workspaceSource, /An explicit focus request should behave like the player clicked/);
assert.match(workspaceSource, /fitView\(\{ nodes: \[\{ id: componentId \}\]/);
assert.match(workspaceSource, /focusConnectionInPresentation/);
assert.match(workspaceSource, /camera: "frame-path"/);

console.log("WebMCP polish verified");
