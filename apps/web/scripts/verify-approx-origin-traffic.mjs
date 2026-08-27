/**
 * Ballpark Traffic Source origin breakdown (not scoring-accurate).
 * Usage: pnpm --filter @faultline/web verify:approx-origin-traffic
 */
import assert from "node:assert/strict";

import { urlShortenerChallenge } from "@faultline/challenges";

import {
  approximateOriginTraffic,
  formatApproxRps,
} from "../features/architecture-canvas/approximate-origin-traffic.ts";

const rows = approximateOriginTraffic({
  geographicDistribution: urlShortenerChallenge.geographicDistribution,
  totalRequestsPerSecond: urlShortenerChallenge.workload.requestsPerSecond,
});

assert.ok(rows.length >= 4, "Level 1 should expose multiple origin regions");
for (const row of rows) {
  assert.ok(row.sharePct % 5 === 0, `${row.regionId} share should snap to 5% steps`);
  assert.ok(row.approxRps > 0, `${row.regionId} should show rough RPS`);
  assert.match(formatApproxRps(row.approxRps), /^~/);
}

const usEast = rows.find((row) => row.regionId === "us-east");
assert.ok(usEast);
assert.equal(usEast.sharePct, 25);
assert.equal(usEast.approxRps, 31_000);

assert.equal(approximateOriginTraffic({ geographicDistribution: [], totalRequestsPerSecond: 10 }).length, 0);

console.log("approximate origin traffic verified");
