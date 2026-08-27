import assert from "node:assert/strict";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { buildVisualWebMcpSurface, registerVisualWebMcpSurface } from "../dist/index.js";

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
]);
assert.deepEqual(surface.tools.map((tool) => tool.name), surface.resolvedNames);
assert.deepEqual(surface.skipped, []);
for (const tool of surface.tools) {
  assert.equal(tool.annotations?.readOnlyHint, false);
  assert.equal(tool.annotations?.destructiveHint, false);
  assert.equal(tool.annotations?.idempotentHint, undefined);
}

// Abort before surface construction: no context read and no registration.
{
  const controller = new AbortController();
  controller.abort();
  let contextCalls = 0;
  let registrations = 0;
  const result = await registerVisualWebMcpSurface({
    modelContext: {
      async registerTool() {
        registrations += 1;
      },
    },
    registry,
    getContext: () => {
      contextCalls += 1;
      return context;
    },
    signal: controller.signal,
  });
  assert.deepEqual(result.registeredToolNames, []);
  assert.equal(contextCalls, 0);
  assert.equal(registrations, 0);
}

// Abort while building: registration is skipped after the awaited live context.
{
  const controller = new AbortController();
  let registrations = 0;
  const pending = registerVisualWebMcpSurface({
    modelContext: {
      async registerTool() {
        registrations += 1;
      },
    },
    registry,
    getContext: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return context;
    },
    signal: controller.signal,
    development: true,
  });
  controller.abort();
  const result = await pending;
  assert.deepEqual(result.registeredToolNames, []);
  assert.equal(registrations, 0);
}

// Abort during registration: browser rejections are contained and no tool is reported registered.
{
  const controller = new AbortController();
  let registrations = 0;
  const pending = registerVisualWebMcpSurface({
    modelContext: {
      registerTool(_tool, { signal }) {
        registrations += 1;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("registration aborted")), { once: true });
        });
      },
    },
    registry,
    getContext: () => context,
    signal: controller.signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  const result = await pending;
  assert.ok(registrations > 0);
  assert.deepEqual(result.registeredToolNames, []);
}

console.log("verify-visual-webmcp-surface: ok");
