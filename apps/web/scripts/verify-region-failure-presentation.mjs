import assert from "node:assert/strict";

import { regionFailurePresentationFromEvents } from "../features/world-map/region-failure-presentation.ts";

const presentation = regionFailurePresentationFromEvents([
  { type: "region_failed", data: { regionId: "us-east", simulated: "true" } },
  { type: "component_failed", componentId: "service-01", data: { simulated: "true" } },
  { type: "database_unavailable", data: { failedRegion: "us-east", simulated: "true" } },
  { type: "region_failed", data: { regionId: "not-a-region" } },
]);

assert.deepEqual(presentation, {
  failedRegionIds: ["us-east"],
  failedComponentIds: ["service-01"],
  databaseUnavailableRegionIds: ["us-east"],
});
assert.equal(regionFailurePresentationFromEvents([{ type: "component_failed", componentId: "service-01", data: {} }]), null);
console.log("region failure presentation verified");
