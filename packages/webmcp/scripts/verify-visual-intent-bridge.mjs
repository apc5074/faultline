import assert from "node:assert/strict";

import {
  appendValidatedAnnotations,
  createDefaultCapabilityRegistry,
  createEmptyAgentSessionState,
  pruneAnnotationsAgainstArchitecture,
} from "@faultline/agent-capabilities";
import { publishVisualIntent, toWebMcpTool } from "../dist/index.js";

const architecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: {}, deployments: [], ui: { x: 0, y: 0 } }],
  connections: [],
};

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

const context = { challenge, architecture };
const registry = createDefaultCapabilityRegistry();

let session = createEmptyAgentSessionState();
const intents = [];

const getContext = () => ({ context, session });

const focusTool = toWebMcpTool(registry.get("focus_component"), {
  registry,
  getContext,
  onVisualIntent: (intent) => {
    intents.push(intent);
    if (intent.kind === "annotation") {
      session = appendValidatedAnnotations(session, architecture, [intent.annotation]);
    } else {
      session = {
        ...session,
        annotations: [],
        revision: session.revision + 1,
      };
    }
  },
});

const focusResult = await focusTool.execute({ componentId: "service-1" }, {});
assert.equal(focusResult.ok, true);
assert.equal(intents.length, 1);
assert.equal(session.annotations.length, 1);
assert.equal(session.annotations[0]?.type, "focus");

const noteTool = toWebMcpTool(registry.get("annotate_component"), {
  registry,
  getContext,
  onVisualIntent: (intent) => {
    intents.push(intent);
    if (intent.kind === "annotation") {
      session = appendValidatedAnnotations(session, architecture, [intent.annotation]);
    }
  },
});

const noteResult = await noteTool.execute(
  { componentId: "service-1", text: "What is the redirect hot path?" },
  {},
);
assert.equal(noteResult.ok, true);
assert.equal(session.annotations.length, 2);

const clearTool = toWebMcpTool(registry.get("clear_annotations"), {
  registry,
  getContext,
  onVisualIntent: (intent) => {
    intents.push(intent);
    if (intent.kind === "clear") {
      session = { ...session, annotations: [], revision: session.revision + 1 };
    }
  },
});

const clearResult = await clearTool.execute({ scope: "all" }, {});
assert.equal(clearResult.ok, true);
if (clearResult.ok) assert.equal(clearResult.data.clearedCount, 2);
assert.equal(session.annotations.length, 0);

const readTool = toWebMcpTool(registry.get("get_challenge"), { registry, getContext, onVisualIntent: () => {
  throw new Error("read tools must not publish visual intents");
}});
await readTool.execute(undefined, {});

const sanitized = { ok: true, data: { annotation: { id: "a1", type: "focus", componentId: "service-1" } } };
const published = [];
publishVisualIntent("focus_component", { componentId: "service-1" }, sanitized, (intent) => published.push(intent));
assert.equal(published.length, 1);
assert.equal(published[0]?.kind, "annotation");
publishVisualIntent("unknown_visual", { componentId: "service-1" }, sanitized, (intent) => published.push(intent));
assert.equal(published.length, 1);

const prunedArchitecture = { version: 1, components: [], connections: [] };
session = appendValidatedAnnotations(createEmptyAgentSessionState(), architecture, [
  { id: "a1", type: "focus", componentId: "service-1" },
]);
session = {
  ...session,
  annotations: pruneAnnotationsAgainstArchitecture(session.annotations, prunedArchitecture),
};
assert.equal(session.annotations.length, 0);

console.log("verify-visual-intent-bridge: ok");
