import assert from "node:assert/strict";

import { buildRunTimeline } from "../features/architecture-canvas/run-timeline.ts";

const events = [
  { type: "simulation_started", data: {} },
  { type: "traffic_routed", data: {} },
  { type: "component_load_changed", componentId: "service-1", data: {} },
  { type: "component_saturated", componentId: "pg-1", data: {} },
  { type: "requirement_failed", data: {} },
  { type: "simulation_finished", data: {} },
];

const timeline = buildRunTimeline(events, 2_000);
assert.deepEqual(timeline.map(({ event }) => event), events, "timeline preserves simulator order");
assert.equal(timeline[0].atMs, 0);
assert.ok(timeline[3].atMs >= 1_200, "saturation must appear mid-run, not at t=0");
assert.ok(timeline[4].atMs > timeline[3].atMs, "requirement verdict evidence follows symptoms");
assert.equal(timeline.at(-1)?.atMs, 2_000);
console.log("run timeline verified");
