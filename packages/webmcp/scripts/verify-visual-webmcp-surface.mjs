import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { buildVisualWebMcpSurface } from "../dist/index.js";

const context = {
  challenge: {
    slug: "url-shortener",
    version: 1,
    title: "Global URL Shortener",
    prompt: "Design",
    developmentOnly: false,
    workload: { requestsPerSecond: 124_000, readRatio: 0.9, writeRatio: 0.1 },
    requirements: [],
    monthlyBudget: 85_000,
    allowedComponentTypes: ["service", "postgres"],
  },
  architecture: {
    version: 1,
    components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
    connections: [],
  },
};

const registry = createDefaultCapabilityRegistry();
const surface = await buildVisualWebMcpSurface({ registry, getContext: () => context, development: true });

assert.deepEqual(surface.resolvedNames, [
  "focus_component",
  "annotate_component",
  "highlight_connection",
  "clear_annotations",
  "pin_observation",
]);
assert.deepEqual(surface.tools.map((tool) => tool.name), surface.resolvedNames);
const annotateTool = surface.tools.find((tool) => tool.name === "annotate_component");
assert.ok(annotateTool);
assert.deepEqual(annotateTool.inputSchema.properties.tone.enum, ["neutral", "question", "risk"]);
assert.deepEqual(surface.skipped, [
  { name: "focus_region", reason: "unavailable" },
]);

const geographicSurface = await buildVisualWebMcpSurface({
  registry,
  getContext: () => ({
    ...context,
    challenge: {
      ...context.challenge,
      geographicDistribution: [{ regionId: "us-east", fraction: 1 }],
    },
  }),
  development: true,
});
assert.equal(geographicSurface.resolvedNames.includes("focus_region"), true);
for (const tool of surface.tools) {
  assert.equal(tool.annotations?.readOnlyHint, false);
  assert.equal(tool.annotations?.untrustedContentHint, undefined);
}

console.log("verify-visual-webmcp-surface: ok");
