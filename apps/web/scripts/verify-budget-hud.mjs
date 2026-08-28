/** P10-006 — budget HUD uses canonical cost facts and exposes a compact breakdown. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { componentRegistry } from "@faultline/component-catalog";
import { urlShortenerStarterArchitecture } from "@faultline/challenges";
import { estimateMonthlyCost } from "@faultline/simulator";

const source = await readFile(
  new URL("../features/architecture-canvas/PlaygroundHudPlates.tsx", import.meta.url),
  "utf8",
);

assert.match(source, /estimateMonthlyCost\(/);
assert.match(source, /Cost breakdown/);
assert.match(source, /OVER BUDGET/);
assert.match(source, /lineItems/);
assert.match(source, /sort\(\(left, right\) => right\.amount - left\.amount\)/);

const cost = estimateMonthlyCost({
  architecture: urlShortenerStarterArchitecture(),
  registry: componentRegistry,
});
assert.equal(
  cost.monthlyTotal,
  cost.lineItems.reduce((total, lineItem) => total + lineItem.amount, 0),
  "HUD breakdown must reconcile to canonical monthly total",
);

console.log("budget HUD verified");
