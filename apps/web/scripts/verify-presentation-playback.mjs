import assert from "node:assert/strict";

import { createPlaybackEvents } from "../features/traffic-playback/presentation-events.ts";
import { buildRunTimeline } from "../features/architecture-canvas/run-timeline.ts";
import {
  advancePresentationPlayback,
  cancelPresentationPlayback,
  createPresentationPlaybackState,
  preparePresentationPlayback,
  settlePresentationPlayback,
  startPresentationPlayback,
} from "../features/traffic-playback/presentation-playback.ts";

const events = createPlaybackEvents({
  runId: "baseline-001",
  source: "baseline",
  events: [
    { type: "traffic_routed", data: { requestsPerSecond: 10_000 } },
    { type: "component_saturated", componentId: "service", data: { utilization: 1.25 } },
  ],
});

assert.deepEqual(
  events.map(({ runId, source, sequence }) => ({ runId, source, sequence })),
  [
    { runId: "baseline-001", source: "baseline", sequence: 0 },
    { runId: "baseline-001", source: "baseline", sequence: 1 },
  ],
);
assert.equal(events[0].event.type, "traffic_routed", "the envelope must retain the original event");
const experimentEvents = createPlaybackEvents({
  runId: "experiment-001",
  source: "experiment",
  events: [events[0].event],
  startSequence: 4,
});
assert.equal(experimentEvents[0].sequence, 4);
assert.equal(experimentEvents[0].source, "experiment");
assert.throws(
  () => createPlaybackEvents({ runId: " ", source: "baseline", events: [] }),
  /non-empty runId/,
);

const timelineEvents = [
  { type: "simulation_started", data: {} },
  { type: "traffic_routed", data: {} },
  { type: "component_load_changed", componentId: "service-1", data: {} },
  { type: "component_saturated", componentId: "pg-1", data: {} },
  { type: "requirement_failed", data: {} },
  { type: "simulation_finished", data: {} },
];
const timeline = buildRunTimeline(timelineEvents, 2_000);
assert.deepEqual(timeline.map(({ event }) => event), timelineEvents, "timeline preserves simulator order");
assert.equal(timeline[0].atMs, 0);
assert.ok(timeline[3].atMs >= 1_200, "saturation must appear mid-run, not at t=0");
assert.ok(timeline[4].atMs > timeline[3].atMs, "requirement verdict evidence follows symptoms");
assert.equal(timeline.at(-1)?.atMs, 2_000);

assert.equal(createPresentationPlaybackState().phase, "idle");

let state = preparePresentationPlayback(events);
assert.equal(state.phase, "preparing");
assert.equal(state.currentEvent, null);

state = startPresentationPlayback(state);
state = advancePresentationPlayback(state);
assert.equal(state.phase, "playing");
assert.equal(state.currentEvent, events[0]);

state = advancePresentationPlayback(state);
assert.equal(state.currentEvent, events[1]);
state = advancePresentationPlayback(state);
assert.equal(state.phase, "settled");
assert.equal(state.currentEvent, events[1], "settled state retains final evidence");

state = cancelPresentationPlayback(preparePresentationPlayback(events));
assert.equal(state.phase, "cancelled");
assert.equal(state.currentEvent, null);
assert.equal(state.events.length, 0);

assert.throws(() => preparePresentationPlayback([]), /at least one authoritative event/);
assert.throws(
  () => preparePresentationPlayback([events[0], { ...events[1], runId: "experiment-001" }]),
  /one run and source/,
);
assert.throws(
  () => preparePresentationPlayback([events[1], events[0]]),
  /strictly increasing sequences/,
);

const settled = settlePresentationPlayback(startPresentationPlayback(preparePresentationPlayback(events)));
assert.equal(settled.phase, "settled");
assert.equal(settled.currentEvent, events[1]);

console.log("presentation events, timeline, and playback verified");
