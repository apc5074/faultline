import assert from "node:assert/strict";

import {
  createAgentCapabilityRegistry,
  createDefaultCapabilityRegistry,
  noInputSchema,
} from "@faultline/agent-capabilities";
import { registerPhase6ReadSurface, toWebMcpTool } from "../dist/index.js";

const challenge = {
  slug: "tiny-api",
  version: 1,
  title: "Tiny API",
  prompt: "Build a small API.",
  developmentOnly: true,
  workload: { requestsPerSecond: 6_000, readRatio: 0.9, writeRatio: 0.1 },
  requirements: [],
  monthlyBudget: 8_000,
  allowedComponentTypes: ["service"],
};

const architecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};

const context = { challenge, architecture };
const registry = createDefaultCapabilityRegistry();

function createSlowRegistry(delayMs) {
  let executeCalls = 0;
  const slowRegistry = createAgentCapabilityRegistry([
    {
      name: "test_slow_read",
      description: "Async fixture for cancellation verification.",
      inputSchema: noInputSchema,
      mode: "read",
      availableWhen: () => true,
      annotations: { readOnlyHint: true, idempotentHint: true },
      async execute() {
        executeCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return { ok: true, data: { done: true } };
      },
    },
  ]);

  return {
    registry: slowRegistry,
    get executeCalls() {
      return executeCalls;
    },
  };
}

// 1. Pre-aborted signal must not invoke domain execution.
{
  let contextCalls = 0;
  let architectureMutations = 0;
  const mutableArchitecture = structuredClone(architecture);
  const slow = createSlowRegistry(10);
  const tool = toWebMcpTool(slow.registry.get("test_slow_read"), {
    registry: slow.registry,
    getContext: async () => {
      contextCalls += 1;
      architectureMutations += 1;
      mutableArchitecture.components[0] = {
        ...mutableArchitecture.components[0],
        config: { mutated: true },
      };
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ...context, architecture: mutableArchitecture };
    },
  });

  const controller = new AbortController();
  controller.abort();
  const result = await tool.execute(undefined, { signal: controller.signal });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "CANCELLED");
  assert.equal(contextCalls, 0);
  assert.equal(slow.executeCalls, 0);
  assert.equal(architectureMutations, 0);
  assert.equal("mutated" in (mutableArchitecture.components[0]?.config ?? {}), false);
}

// 2. Abort during async boundaries returns CANCELLED without success.
{
  let contextCalls = 0;
  const slow = createSlowRegistry(40);
  const tool = toWebMcpTool(slow.registry.get("test_slow_read"), {
    registry: slow.registry,
    getContext: async () => {
      contextCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return context;
    },
  });

  const controller = new AbortController();
  const pending = tool.execute(undefined, { signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "CANCELLED");
  assert.equal(contextCalls, 1);
  assert.equal(slow.executeCalls, 0);
}

// 3-5. Registration lifecycle races with a controllable modelContext mock.
{
  const activeControllers = new Set();
  const registered = [];
  let pendingResolve;

  const modelContext = {
    registerTool: (tool, { signal }) =>
      new Promise((resolve, reject) => {
        activeControllers.add(signal);
        const onAbort = () => {
          activeControllers.delete(signal);
          reject(new Error("registration aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        pendingResolve = () => {
          signal.removeEventListener("abort", onAbort);
          activeControllers.delete(signal);
          if (signal.aborted) {
            reject(new Error("registration aborted"));
            return;
          }
          registered.push(tool.name);
          resolve(undefined);
        };
      }),
  };

  let getContextCalls = 0;
  const getContext = async () => {
    getContextCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return context;
  };

  const controller = new AbortController();
  const pendingRegistration = registerPhase6ReadSurface({
    modelContext,
    registry,
    getContext,
    signal: controller.signal,
    development: true,
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort();
  pendingResolve?.();
  const registrationResult = await pendingRegistration;

  assert.deepEqual(registrationResult.registeredToolNames, []);
  assert.equal(registered.length, 0);
  assert.equal(activeControllers.size, 0);
}

{
  const registered = [];
  const modelContext = {
    registerTool: (tool, { signal }) => {
      if (signal.aborted) return Promise.reject(new Error("registration aborted"));
      registered.push(tool.name);
      return Promise.resolve(undefined);
    },
  };

  const controller = new AbortController();
  controller.abort();
  const result = await registerPhase6ReadSurface({
    modelContext,
    registry,
    getContext: () => context,
    signal: controller.signal,
  });

  assert.deepEqual(result.registeredToolNames, []);
  assert.equal(registered.length, 0);
}

// Normal read-only invocation remains fast when no cancellation occurs.
{
  const started = performance.now();
  const tool = toWebMcpTool(registry.get("get_challenge"), {
    registry,
    getContext: () => context,
  });
  const result = await tool.execute(undefined, {});
  assert.equal(result.ok, true);
  assert.ok(performance.now() - started < 250);
}

console.log("verify-cancellation-lifecycle: ok");
