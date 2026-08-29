import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildRunTimeline,
  firstFailingComponentId,
  RUN_RAMP_FRACTION,
  runRamp01,
} from "../features/architecture-canvas/run-timeline.ts";
import {
  MAX_VISIBLE_REJECTED_PER_COMPONENT,
  resetTickSimulationState,
  tickSimulation,
} from "../features/traffic-playback/tick-simulation.ts";

// --- Edge ramp-in: weights ease in over the opening of a timed run ---------

assert.equal(runRamp01(0, 2_000), 0, "no edge weight at t=0");
assert.equal(runRamp01(-50, 2_000), 0, "ramp clamps below zero");
assert.equal(runRamp01(RUN_RAMP_FRACTION * 2_000 * 0.5, 2_000), 0.5, "halfway through the ramp window");
assert.equal(runRamp01(RUN_RAMP_FRACTION * 2_000, 2_000), 1, "ramp completes at the ramp fraction");
assert.equal(runRamp01(5_000, 2_000), 1, "ramp clamps at full weight");
assert.equal(runRamp01(0, 0), 0, "degenerate duration stays safe");

// Ramp window scales with the run, so long runs ease in over more wall time.
assert.ok(RUN_RAMP_FRACTION > 0 && RUN_RAMP_FRACTION <= 0.25, "ramp stays an opening beat, not half the run");

// --- Rejection volume honesty ----------------------------------------------
// A full queue rejects every arrival after the first. Individual red × marks
// cap out; the cumulative tabular counter carries the true volume.

resetTickSimulationState();

const queue = {
  id: "q",
  type: "queue",
  state: "idle",
  instances: 1,
  capacity: 4,
  depth: 1,
  replicas: 1,
  algorithm: "round-robin",
  inputPorts: [{ id: "in" }],
  outputPorts: [{ id: "out" }],
  processingPackets: [],
};
const connections = [
  { id: "c1", fromComponentId: "u", fromPortId: "out", toComponentId: "q", toPortId: "in", load: 0 },
];

let packets = [];
let result = null;
for (let tick = 0; tick < 12; tick += 1) {
  packets = [...packets, { id: `inject-${tick}`, shape: "request", connectionId: "c1", progress: 0.99 }];
  result = tickSimulation([queue], connections, packets, 1, tick, {});
  packets = result.packets;
}

const rejectedCount = result.components.find((component) => component.id === "q")?.rejectedCount ?? 0;
assert.ok(rejectedCount >= 6, `rejections are counted cumulatively (got ${rejectedCount})`);

const visibleRejected = result.packets.filter((packet) => packet.shape === "rejected").length;
assert.ok(
  visibleRejected <= MAX_VISIBLE_REJECTED_PER_COMPONENT,
  `visible × marks cap at ${MAX_VISIBLE_REJECTED_PER_COMPONENT} (got ${visibleRejected})`,
);
assert.ok(visibleRejected > 0, "low-volume rejections still render as individual × marks");

// --- Timeline still orders evidence after the ramp helpers landed -----------

const timeline = buildRunTimeline(
  [
    { type: "simulation_started", data: {} },
    { type: "component_saturated", componentId: "pg-1", data: {} },
    { type: "simulation_finished", data: {} },
  ],
  3_000,
);
assert.equal(timeline[0].atMs, 0);
assert.equal(timeline.at(-1)?.atMs, 3_000);

// --- First failing component + verdict timing + settled language -----------

assert.equal(
  firstFailingComponentId([
    { type: "simulation_started" },
    { type: "component_warning", componentId: "svc" },
    { type: "component_saturated", componentId: "pg" },
    { type: "component_saturated", componentId: "redis" },
    { type: "requirement_failed" },
  ]),
  "pg",
  "first saturation is the culprit, not later ones or warnings",
);
assert.equal(
  firstFailingComponentId([{ type: "component_failed", componentId: "cdn" }]),
  "cdn",
  "injected failure counts as the culprit",
);
assert.equal(
  firstFailingComponentId([{ type: "requirement_failed" }]),
  null,
  "requirement miss without a component is not a tick",
);

const controller = readFileSync(
  new URL("../features/traffic-playback/use-playback-controller.ts", import.meta.url),
  "utf8",
);
assert.match(controller, /export const SETTLING_MS = 700/);
const completeAtSettle = controller.indexOf('setPhase("settled")');
const completeCall = controller.indexOf("complete?.()", completeAtSettle);
assert.ok(
  completeAtSettle >= 0 && completeCall > completeAtSettle,
  "verdict callback fires at the end of settling, not the start",
);

const canvas = readFileSync(new URL("../features/architecture-canvas/ArchitectureCanvas.tsx", import.meta.url), "utf8");
assert.match(canvas, /"Last run · evidence · stale"/);
assert.match(canvas, /"Last run · evidence"/);
assert.match(canvas, /worldRoutesAnimating=\{workspace\.playback\.phase === "playing"\}/);
assert.match(canvas, /worldRoutesStale=\{workspace\.resultIsStale\}/);

const map = readFileSync(new URL("../features/world-map/WorldMap.tsx", import.meta.url), "utf8");
assert.match(map, /routesAnimating: boolean/);
assert.match(map, /routesAnimating \? "world-map__arc--flow" : ""/);
assert.match(map, /routesStale \? "world-map__arc--stale" : ""/);

const hud = readFileSync(new URL("../features/architecture-canvas/PlaygroundHudPlates.tsx", import.meta.url), "utf8");
assert.match(hud, /hud-plate--stamp/);

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
assert.match(css, /hud-plate-stamp/);
assert.match(css, /scale\(1\.1\)/);
assert.match(css, /playground-node__culprit-tick/);
assert.match(css, /playground-corner-hud__last-run--stale/);
assert.match(css, /world-map__arc--stale/);

const simBar = readFileSync(new URL("../features/architecture-canvas/SimBar.tsx", import.meta.url), "utf8");
assert.match(simBar, /timelineProgress01\?: number/);
assert.match(simBar, /role="progressbar"/);
assert.match(simBar, /running · \{formatRunTime\(elapsedMs\)\} \/ \{formatRunTime\(timelineDurationMs\)\}/);
assert.match(simBar, /<button type="button" className="sim-bar__button" onClick=\{onStep\}>step<\/button>/);
assert.match(simBar, /disabled=\{transportRetired\}/);
assert.match(simBar, /✓ All requirements passed/);
assert.match(simBar, /playbackPhase === "settling"/);

assert.match(controller, /A timed run advances by simulator evidence/);
assert.match(controller, /timelineEventIndexRef\.current \+= 1/);

console.log("run feedback verified");
