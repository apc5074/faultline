import assert from "node:assert/strict";
import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { buildPhase6ReadSurface, probeWebMcpCompatibility } from "../dist/index.js";

const context = {
  challenge: { slug: "tiny-api", version: 1, allowedComponentTypes: ["service"] },
  architecture: { components: [{ id: "service-1", type: "service", config: {}, deployments: [] }], connections: [] },
  simulation: { available: true, components: {} },
};
const surface = await buildPhase6ReadSurface({ registry: createDefaultCapabilityRegistry(), getContext: () => context, development: true });
for (const tool of surface.tools) {
  assert.match(tool.name, /^[A-Za-z0-9_.-]{1,128}$/);
  assert.equal(typeof tool.title, "string");
  assert.equal("outputSchema" in tool, false);
  assert.ok(tool.inputSchema && JSON.stringify(tool.inputSchema));
  for (const key of Object.keys(tool.annotations ?? {})) assert.ok(["readOnlyHint", "untrustedContentHint"].includes(key));
}
assert.equal(probeWebMcpCompatibility({ registerTool: async () => {} }).standardRegistration, true);
assert.equal(probeWebMcpCompatibility({}).standardRegistration, false);
console.log("WebMCP compatibility verification passed");
