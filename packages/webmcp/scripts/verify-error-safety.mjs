import assert from "node:assert/strict";

import { createAgentCapabilityRegistry, createDefaultCapabilityRegistry, noInputSchema } from "@faultline/agent-capabilities";
import {
  buildPhase6ReadSurface,
  isControlledCapabilityResult,
  sanitizeWebMcpCapabilityResult,
  toWebMcpTool,
  unexpectedWebMcpCapabilityFailure,
} from "../dist/index.js";

const challenge = {
  slug: "url-shortener",
  version: 1,
  title: "Global URL Shortener",
  prompt: "Design",
  developmentOnly: false,
  workload: { requestsPerSecond: 124_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 85_000,
  allowedComponentTypes: ["service"],
};

const architecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};

const simulation = {
  available: true,
  components: {
    "service-1": {
      metrics: { incomingRps: 1_000, capacityRps: 2_000, utilization: 0.5, headroom: 0.5 },
    },
  },
};

const validContext = { challenge, architecture, simulation };
const invalidContext = {
  challenge,
  architecture,
  simulation: { available: false, validationErrors: ["Missing traffic path."] },
};

const registry = createDefaultCapabilityRegistry();
const getContext = () => validContext;

const surface = await buildPhase6ReadSurface({ registry, getContext, development: true });
assert.equal(surface.tools.length, 7);

for (const tool of surface.tools) {
  assert.equal(tool.annotations?.readOnlyHint, true);
  assert.equal(tool.annotations?.idempotentHint, true);
  assert.equal(tool.annotations?.destructiveHint, undefined);
}

function assertSafeError(result, expectedCode) {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, expectedCode);
    assert.equal(typeof result.message, "string");
    assert.equal("stack" in result, false);
    assert.equal(JSON.stringify(result).includes("Error:"), false);
  }
}

const inspectTool = surface.tools.find((tool) => tool.name === "inspect_component");
assert.ok(inspectTool);

assertSafeError(await inspectTool.execute({}, {}), "INVALID_INPUT");
assertSafeError(await inspectTool.execute({ componentId: "missing" }, {}), "NOT_FOUND");

const estimateTool = toWebMcpTool(registry.get("estimate_capacity"), {
  registry,
  getContext: () => invalidContext,
});
assertSafeError(await estimateTool.execute({}, {}), "SIMULATION_UNAVAILABLE");

const preAborted = new AbortController();
preAborted.abort();
assertSafeError(await inspectTool.execute({ componentId: "service-1" }, { signal: preAborted.signal }), "CANCELLED");

const throwingContextTool = toWebMcpTool(registry.get("get_challenge"), {
  registry,
  getContext: () => {
    throw new Error("secret internal failure");
  },
  development: false,
});
const unexpected = await throwingContextTool.execute(undefined, {});
assertSafeError(unexpected, "INVALID_INPUT");
assert.equal(unexpected.message.includes("secret"), false);

assert.equal(
  isControlledCapabilityResult({ ok: false, code: "NOT_FOUND", message: "Unknown component.", stack: "hidden" }),
  false,
);
assert.deepEqual(
  sanitizeWebMcpCapabilityResult({ ok: false, code: "NOT_FOUND", message: "Unknown component." }, "inspect_component"),
  { ok: false, code: "NOT_FOUND", message: "Unknown component." },
);
assert.deepEqual(
  sanitizeWebMcpCapabilityResult({ ok: false, code: "WEIRD", message: "nope" }, "inspect_component"),
  { ok: false, code: "INVALID_INPUT", message: "nope" },
);
assert.deepEqual(unexpectedWebMcpCapabilityFailure("get_challenge", new Error("secret"), false), {
  ok: false,
  code: "INVALID_INPUT",
  message: 'Capability "get_challenge" failed unexpectedly.',
});

const malformedRegistry = createAgentCapabilityRegistry([
  {
    name: "get_challenge",
    description: "Malformed fixture.",
    inputSchema: noInputSchema,
    mode: "read",
    availableWhen: () => true,
    annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: true },
    execute: () => ({ ok: false, code: "WEIRD", message: "bad", stack: "trace" }),
  },
]);

const malformedTool = toWebMcpTool(malformedRegistry.get("get_challenge"), {
  registry: malformedRegistry,
  getContext: () => validContext,
});
const malformed = await malformedTool.execute(undefined, {});
assert.equal(malformed.ok, false);
if (!malformed.ok) {
  assert.equal(malformed.code, "INVALID_INPUT");
  assert.equal("stack" in malformed, false);
}

assert.equal(malformedTool.annotations?.destructiveHint, undefined);

console.log("verify-error-safety: ok");
