import assert from "node:assert/strict";
import { urlShortenerChallenge } from "@faultline/challenges";
import { createWebMcpEvidenceSource } from "../features/webmcp/evidence-store.ts";

let architecture = {
  version: 1,
  components: [{ id: "service-1", type: "service", config: { instances: 1 }, deployments: [], ui: { x: 1, y: 1 } }],
  connections: [],
};
let session = { focus: { kind: "none" }, pendingHelpRequest: null, annotations: [], experimentConsent: null, revision: 0 };
let builds = 0;
const buildDelays = [];
const source = createWebMcpEvidenceSource({
  getArchitecture: () => architecture,
  getChallenge: () => urlShortenerChallenge,
  getSession: () => session,
  buildContext: async (nextArchitecture, challenge) => {
    builds += 1;
    await new Promise((resolve) => setTimeout(resolve, buildDelays.shift() ?? 0));
    return {
      architecture: nextArchitecture,
      challenge,
      simulation: { available: false },
      evidenceMeta: { architectureRevision: String(nextArchitecture.components[0].config.instances), simulationRunId: "live-test", simulatorVersion: "test", isStale: false, generatedAt: `build-${builds}` },
    };
  },
});

const concurrent = await Promise.all([source.getEvidence(), source.getEvidence(), source.getEvidence()]);
assert.equal(builds, 1);
assert.equal(new Set(concurrent.map((snapshot) => snapshot.key)).size, 1);
assert.equal(concurrent[0].context.evidenceMeta.generatedAt, concurrent[1].context.evidenceMeta.generatedAt);
assert.ok(concurrent[0].context.reviewPackets);

session = { ...session, revision: 1, focus: { kind: "component", componentId: "service-1", source: "selection" } };
assert.equal((await source.getSnapshot()).session.revision, 1);
assert.equal(builds, 1, "session-only changes must not rebuild evidence");

architecture = { ...architecture, components: [{ ...architecture.components[0], config: { instances: 2 }, ui: { x: 90, y: 90 } }] };
const edited = await source.getEvidence();
assert.equal(builds, 2);
assert.equal(edited.context.architecture.components[0].config.instances, 2);
assert.notEqual(edited.key, concurrent[0].key);
assert.equal(edited.context.reviewDelta.fromRevision, "1");
assert.equal(edited.context.reviewDelta.toRevision, "2");
assert.deepEqual(edited.context.reviewDelta.changedComponentIds, ["service-1"]);

buildDelays.push(20, 0);
architecture = { ...architecture, components: [{ ...architecture.components[0], config: { instances: 3 } }] };
const oldBuild = source.getEvidence();
architecture = { ...architecture, components: [{ ...architecture.components[0], config: { instances: 4 } }] };
const newBuild = source.getEvidence();
const newest = await newBuild;
await oldBuild;
assert.equal((await source.getEvidence()).context.architecture.components[0].config.instances, 4);
assert.equal(newest.context.architecture.components[0].config.instances, 4);

source.dispose();
assert.rejects(source.getEvidence(), /disposed/);
source.activate();
assert.equal((await source.getEvidence()).context.architecture.components[0].config.instances, 4);
console.log("verify-webmcp-evidence-store: ok");
