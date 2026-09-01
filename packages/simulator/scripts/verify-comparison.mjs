import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { compareArchitectureScenario } from "../dist/index.js";

const original = {
  version: 1,
  components: [
    { id: "traffic", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 100, y: 0 } },
    { id: "db", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 200, y: 0 } },
  ],
  connections: [
    { id: "a", sourceComponentId: "traffic", sourcePortId: "request_out", targetComponentId: "service", targetPortId: "request_in", type: "request" },
    { id: "b", sourceComponentId: "service", sourcePortId: "database_out", targetComponentId: "db", targetPortId: "database_in", type: "read_write" },
  ],
};
const candidate = structuredClone(original);
candidate.components[1].config.instances = 8;
candidate.components[1].deployments = [{ id: "use1", regionId: "us-east", config: { instances: 8 } }];
candidate.components[1].ui = { x: 999, y: 999 };
candidate.components.push({ id: "cache", type: "redis", config: { mode: "standalone", tier: "medium", ttlBand: "medium" }, deployments: [], ui: { x: 300, y: 0 } });
candidate.connections = [candidate.connections[0], { id: "cache-edge", sourceComponentId: "service", sourcePortId: "database_out", targetComponentId: "cache", targetPortId: "cache_in", type: "read_write" }, { id: "b", sourceComponentId: "cache", sourcePortId: "origin_out", targetComponentId: "db", targetPortId: "database_in", type: "read_write" }];
const challenge = { ...tinyApiChallenge, allowedComponentTypes: [...tinyApiChallenge.allowedComponentTypes, "redis"] };
const input = { originalArchitecture: original, candidateArchitecture: candidate, challenge, registry: componentRegistry, scenario: { type: "traffic_multiplier", parameters: { multiplier: 2 } } };
const result = compareArchitectureScenario(input);
assert.equal("outcome" in result.originalScenario, true);
assert.equal("outcome" in result.candidateScenario, true);
assert.equal(result.candidateNormal.valid, true);
assert.deepEqual(result.architectureDelta.componentsAdded, [{ id: "cache", type: "redis" }]);
assert.deepEqual(result.architectureDelta.connectionsAdded, ["b", "cache-edge"]);
assert.deepEqual(result.architectureDelta.connectionsRemoved, ["b"]);
assert.equal(result.architectureDelta.configChanges[0]?.id, "service");
assert.deepEqual(result.architectureDelta.deploymentsAdded.map((change) => change.id), ["service:use1"]);
assert.equal(typeof result.scenarioMetricDelta?.throughputRatio, "number");
assert.equal(Array.isArray(result.scenarioRequirementDelta?.changed), true);
assert.equal(result.originalArchitectureRevision, compareArchitectureScenario({ ...input, candidateArchitecture: structuredClone(original) }).originalArchitectureRevision);
assert.equal(result.candidateArchitectureRevision, compareArchitectureScenario({ ...input, candidateArchitecture: { ...structuredClone(candidate), components: [...candidate.components].reverse(), connections: [...candidate.connections].reverse() } }).candidateArchitectureRevision);
assert.deepEqual(original.components[1].ui, { x: 100, y: 0 });

const uiOnly = structuredClone(original);
uiOnly.components[1].ui = { x: 888, y: 777 };
const uiResult = compareArchitectureScenario({ ...input, candidateArchitecture: uiOnly });
assert.equal(uiResult.originalArchitectureRevision, uiResult.candidateArchitectureRevision);
assert.deepEqual(uiResult.architectureDelta, { componentsAdded: [], componentsRemoved: [], connectionsAdded: [], connectionsRemoved: [], configChanges: [], deploymentsAdded: [], deploymentsRemoved: [], deploymentChanges: [] });

const invalid = compareArchitectureScenario({ ...input, candidateArchitecture: { version: 1, components: [], connections: [] } });
assert.equal(invalid.candidateScenario.valid, false);
assert.equal(invalid.candidateNormal.valid, false);
assert.equal(invalid.scenarioRequirementDelta, null);
const malformed = compareArchitectureScenario({ ...input, candidateArchitecture: { nope: true } });
assert.equal(malformed.candidateArchitectureRevision, "invalid");
assert.equal(malformed.candidateScenario.valid, false);
console.log("architecture scenario comparison verified");
