import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { compileChallengeFromLevelProfile, getLevelProfile, starterArchitectureFromProfile } from "@faultline/challenges";
import { calibrateInterviewScenarios } from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "traffic", type: "traffic-source", config: { label: "traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "api", type: "service", config: { size: "medium", instances: 1 }, deployments: [], ui: { x: 1, y: 0 } },
  ],
  connections: [{ id: "request", sourceComponentId: "traffic", sourcePortId: "request_out", targetComponentId: "api", targetPortId: "request_in", type: "request" }],
};
const challenge = { slug: "interview", version: 1, title: "Interview", prompt: "Design", developmentOnly: false, workload: { requestsPerSecond: 2000, readRatio: 1, writeRatio: 0 }, requirements: [], monthlyBudget: 1, allowedComponentTypes: ["traffic-source", "service"] };
const input = { architecture, challenge, architectureRevision: "rev-1", simulatorVersion: "sim-1" };
const first = calibrateInterviewScenarios(input, componentRegistry);
const second = calibrateInterviewScenarios(input, componentRegistry);
assert.deepEqual(first, second);
assert.deepEqual(first.candidates.map((candidate) => candidate.targetComponentId), ["api", "api"]);
assert.deepEqual(first.candidates.map((candidate) => candidate.kind).sort(), ["failure", "scale"]);
assert.equal(first.candidates.find((candidate) => candidate.kind === "scale").earlyCareerEditCap, 1);
assert.equal(first.candidates.find((candidate) => candidate.kind === "scale").trafficMultiplier, 1.25);
assert.equal(first.candidates.find((candidate) => candidate.kind === "failure").failureScope, "component");
assert.deepEqual(first.witnesses.find((witness) => witness.candidateId === "scale-api"), { candidateId: "scale-api", passingConfigPath: "instances", passingValue: 2, hidden: true });
assert.equal(architecture.components[1].config.instances, 1);
const maxed = { ...architecture, components: architecture.components.map((component) => component.id === "api" ? { ...component, config: { ...component.config, instances: 4 } } : component) };
const maxedCalibration = calibrateInterviewScenarios({ ...input, architecture: maxed }, componentRegistry);
assert.equal(maxedCalibration.candidates.every((candidate) => candidate.kind !== "scale"), true);
assert.equal(maxedCalibration.candidates.some((candidate) => candidate.kind === "failure"), true);

const profile = getLevelProfile("url-shortener");
const starter = starterArchitectureFromProfile(profile);
const urlChallenge = compileChallengeFromLevelProfile(profile);
const urlCalibration = calibrateInterviewScenarios({
  architecture: starter,
  challenge: urlChallenge,
  architectureRevision: "url-rev",
  simulatorVersion: "sim-1",
}, componentRegistry);
const urlScale = urlCalibration.candidates.find((candidate) => candidate.kind === "scale");
assert.ok(urlScale, "url-shortener starter must qualify a scale scenario");
assert.equal(urlScale.targetComponentId, "service-start");
assert.ok(typeof urlScale.trafficMultiplier === "number" && urlScale.trafficMultiplier > 0);
assert.ok(urlCalibration.candidates.some((candidate) => candidate.kind === "failure"));

console.log("verify-interview-scenario: ok");
