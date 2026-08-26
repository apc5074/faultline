import assert from "node:assert/strict";

import { buildGetArchitectureOutput, createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { urlShortenerChallenge } from "@faultline/challenges";

import { createAgentContext, createLiveAgentContextFactory } from "../lib/agent-context/create-agent-context.ts";

const baseArchitecture = {
  version: 1,
  components: [
    {
      id: "service-1",
      type: "service",
      config: { instances: 4 },
      deployments: [],
      ui: { x: 10, y: 20 },
    },
  ],
  connections: [],
};

let currentArchitecture = structuredClone(baseArchitecture);
const source = {
  getArchitecture: () => currentArchitecture,
  getChallenge: () => urlShortenerChallenge,
};
const factory = createLiveAgentContextFactory(source);

const first = factory();
assert.equal(first.challenge.slug, urlShortenerChallenge.slug);
assert.equal(first.architecture.components[0]?.config.instances, 4);

currentArchitecture = {
  ...currentArchitecture,
  components: [
    {
      ...currentArchitecture.components[0],
      config: { instances: 9 },
    },
  ],
};

const second = factory();
assert.equal(second.architecture.components[0]?.config.instances, 9);
assert.notEqual(
  second.architecture.components[0]?.config.instances,
  first.architecture.components[0]?.config.instances,
);

const invalidArchitecture = { version: 1, components: [], connections: [] };
const invalidContext = createAgentContext(invalidArchitecture, urlShortenerChallenge);
assert.equal(invalidContext.simulation?.available, false);
assert.equal(invalidContext.cost, undefined);

const registry = createDefaultCapabilityRegistry();
const invalidMetrics = await registry.invoke("get_metrics", invalidContext, undefined);
assert.equal(invalidMetrics.ok, true);
if (invalidMetrics.ok) {
  assert.equal("simulationAvailable" in invalidMetrics.data && invalidMetrics.data.simulationAvailable, false);
}

const invalidCapacity = await registry.invoke("estimate_capacity", invalidContext, undefined);
assert.equal(invalidCapacity.ok, false);
if (!invalidCapacity.ok) assert.equal(invalidCapacity.code, "SIMULATION_UNAVAILABLE");

const architectureView = await registry.invoke("get_architecture", second, undefined);
assert.equal(architectureView.ok, true);
if (architectureView.ok) {
  const projected = buildGetArchitectureOutput(second.architecture);
  assert.deepEqual(architectureView.data, projected);
  assert.equal(JSON.stringify(architectureView.data).includes('"ui"'), false);
}

const serverContext = createAgentContext(currentArchitecture, urlShortenerChallenge);
assert.deepEqual(factory(), serverContext);

console.log("verify-live-agent-context-factory: ok");
