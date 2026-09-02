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
const guide = await readFile(new URL("../app/webmcp/page.tsx", import.meta.url), "utf8");
const inspector = await readFile(
  new URL("../features/webmcp-inspector/WebMcpInspector.tsx", import.meta.url),
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
assert.match(status, /Page tools registered/);
assert.match(status, /href="\/webmcp"/);
assert.doesNotMatch(status, /edit.*architecture|submit/i);
assert.doesNotMatch(status, /read.*visual.*simulated/);
assert.match(status, /Agent tools disabled/);
assert.match(architectureWorkspace, /playground-topbar__agent-status/);
assert.match(registration, /WEBMCP_REGISTRATION_DEADLINE_MS/);
assert.match(registration, /publishedStatusRef/);
assert.match(registration, /return current/);
assert.match(registration, /result\.resolvedToolNames\.length === 0/);
assert.match(registration, /tool_callback_total_ms/);
assert.match(registration, /invocationObserved/);
assert.match(registration, /statuses\.every\(\(status\) => status\.state === "unsupported"\)/);
assert.match(registration, /statuses\.every\(\(status\) => status\.state === "disabled"\)/);
assert.doesNotMatch(registration, /!active \|\| timedOut/);
assert.doesNotMatch(registration, /active && !timedOut/);
assert.match(docs, /review_current_design/);
assert.match(docs, /WebMCP tools do not receive architecture-edit powers/);
assert.match(docs, /direct single-component explanation is stricter/);
assert.match(docs, /completed camera movement/);
assert.match(guide, /Available site tools/);
assert.match(guide, /Page registration alone does not prove/);
assert.match(guide, /simulator-looking prose as unverified/);
assert.match(inspector, /Page registration API/);
assert.match(inspector, /host discovery: not exposed to page JavaScript/);
assert.match(inspector, /No WebMCP evidence obtained/);
assert.match(workspaceSource, /spotlightPresentationCue/);
assert.match(workspaceSource, /attentionConnectionIds/);
assert.match(workspaceSource, /pendingCameraRef/);
assert.match(workspaceSource, /frame-path/);
assert.match(workspaceSource, /componentIds\.map\(\(id\) => \(\{ id \}\)\)/);
assert.match(workspaceSource, /COMPONENT_FOCUS_ZOOM/);
assert.match(workspaceSource, /fitView\(\{\s*nodes: \[\{ id: componentId \}\]/);
assert.match(workspaceSource, /status: "centered"/);
assert.match(workspaceSource, /focusConnectionInPresentation/);
assert.match(workspaceSource, /camera: "frame-path"/);

console.log("WebMCP polish verified");
