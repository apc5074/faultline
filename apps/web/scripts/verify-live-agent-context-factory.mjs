import assert from "node:assert/strict";

import { createEmptyAgentSessionState } from "@faultline/agent-capabilities";
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
let currentSession = createEmptyAgentSessionState();
const source = {
  getArchitecture: () => currentArchitecture,
  getChallenge: () => urlShortenerChallenge,
  getSession: () => currentSession,
};
const factory = createLiveAgentContextFactory(source);

const first = factory();
assert.equal(first.context.challenge.slug, urlShortenerChallenge.slug);
assert.equal(first.context.architecture.components[0]?.config.instances, 4);
assert.deepEqual(first.session, createEmptyAgentSessionState());
assert.ok(first.context.evidenceMeta?.architectureRevision);
assert.ok(first.context.evidenceMeta?.simulationRunId.startsWith("live-"));
assert.equal(first.context.evidenceMeta?.isStale, false);
assert.ok(first.context.evidenceMeta?.generatedAt);

currentArchitecture = {
  ...currentArchitecture,
  components: [
    {
      ...currentArchitecture.components[0],
      config: { instances: 9 },
    },
  ],
};

currentSession = {
  ...currentSession,
  focus: { kind: "component", componentId: "service-1", source: "selection" },
  revision: 3,
};

const second = factory();
assert.equal(second.context.architecture.components[0]?.config.instances, 9);
assert.equal(second.session.revision, 3);
assert.notEqual(
  second.context.architecture.components[0]?.config.instances,
  first.context.architecture.components[0]?.config.instances,
);

const invalidArchitecture = { version: 1, components: [], connections: [] };
const invalidContext = createAgentContext(invalidArchitecture, urlShortenerChallenge);
assert.equal(invalidContext.simulation?.available, false);
assert.equal(invalidContext.cost, undefined);

const serverContext = createAgentContext(currentArchitecture, urlShortenerChallenge);
const liveContext = factory().context;
assert.deepEqual(liveContext.architecture, serverContext.architecture);
assert.deepEqual(liveContext.simulation, serverContext.simulation);
assert.equal(liveContext.evidenceMeta?.architectureRevision, serverContext.evidenceMeta?.architectureRevision);
assert.equal(liveContext.evidenceMeta?.simulationRunId, serverContext.evidenceMeta?.simulationRunId);
assert.equal(liveContext.evidenceMeta?.simulatorVersion, serverContext.evidenceMeta?.simulatorVersion);

console.log("verify-live-agent-context-factory: ok");
