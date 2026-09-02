import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { advanceInterviewLiveScenario, cancelInterviewLiveScenario, prepareInterviewLiveScenario, replaceInterviewLiveScenario } from "../features/traffic-playback/interview-live-scenario.ts";

const panel = readFileSync(new URL("../features/agent-session/InterviewV2StatusPanel.tsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../features/architecture-canvas/ArchitectureCanvas.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

assert.match(canvas, /InterviewV2StatusPanel/);
assert.match(canvas, /InterviewLiveSpotlightBridge/);
assert.match(canvas, /onModeledFailure=\{workspace\.applyInterviewModeledFailure\}/);
const bridge = readFileSync(new URL("../features/agent-session/InterviewLiveSpotlightBridge.tsx", import.meta.url), "utf8");
assert.match(bridge, /live-failure-v2/);
assert.match(bridge, /onModeledFailure/);
assert.match(bridge, /error-location/);
assert.match(bridge, /Always clear after Q4/);
assert.match(bridge, /onModeledFailure\(null\)/);
const workspace = readFileSync(new URL("../features/architecture-canvas/usePlaygroundWorkspace.ts", import.meta.url), "utf8");
assert.match(workspace, /interviewModeledFailureComponentId/);
assert.match(workspace, /cue\.reason === "error-location"/);
assert.match(workspace, /state: "failed"/);
assert.equal(/from "@\/features\/agent-session\/InterviewStatusPanel"/.test(canvas), false);
assert.equal(/<InterviewStatusPanel[\s>]/.test(canvas), false);

for (const copy of [
  "Edit the canvas—your architecture is the answer.",
  "Review my redesign.",
  "Question {ordinal} of {totalQuestions}",
  "Interview complete",
  "not an official submission",
  "Restart interview",
  "Dismiss and clear",
  "navigator.clipboard.writeText",
  "Review prepared from the current redesign",
  "Answer in chat—do not edit the canvas.",
  "Highlighted component is the modeled failure target",
]) {
  if (!panel.includes(copy)) throw new Error(`Missing interview UI copy or behavior: ${copy}`);
}

for (const selector of [
  ".interview-status-panel__simulation-note",
  ".interview-status-panel__completion",
  ".interview-status-panel__actions",
]) {
  if (!css.includes(selector)) throw new Error(`Missing interview UI styling: ${selector}`);
}

if (panel.includes("run_load_test") || panel.includes("submitSimulationCritique(context")) {
  throw new Error("Simulation UI must not invoke standalone experiments or silently submit critique.");
}

const events = [
  { type: "simulation_started", data: { requestsPerSecond: 10 } },
  { type: "component_saturated", componentId: "api", data: { utilization: 1.2 } },
];
let state = prepareInterviewLiveScenario({ scenarioId: "scale-api", evidenceRevision: "rev-1", events });
assert.equal(state.phase, "bursting");
assert.deepEqual(state.failureComponentIds, ["api"]);
state = advanceInterviewLiveScenario(state);
assert.equal(state.currentEvent.event.type, "simulation_started");
state = advanceInterviewLiveScenario(state);
assert.equal(state.phase, "settled");
assert.equal(state.currentEvent.event.componentId, "api");
assert.equal(replaceInterviewLiveScenario(state, { scenarioId: "scale-api", evidenceRevision: "rev-1", events: [{ type: "other", data: {} }] }), state);
const reduced = prepareInterviewLiveScenario({ scenarioId: "scale-api", evidenceRevision: "rev-2", events, reducedMotion: true });
assert.equal(reduced.phase, "settled");
assert.equal(reduced.nextEventIndex, 2);
assert.equal(cancelInterviewLiveScenario(state).phase, "cancelled");
assert.deepEqual(cancelInterviewLiveScenario(state).events, []);
console.log("interview simulation UI verified");
console.log("verify-interview-simulation-ui: ok");
