/** GEO-09 — geo transfer and CDN usage cost follows simulated traffic. */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "../dist/index.js";
import { createSevenComponentArchitecture, level1CompositionChallenge } from "./fixtures/level1-composition.mjs";

function evaluate(architecture) {
  const result = evaluateRequirements({ architecture, challenge: level1CompositionChallenge, registry: componentRegistry });
  assert.equal(result.valid, true);
  return result;
}

console.log("Check — CDN usage cost follows sustained simulated ingress");
const baselineArchitecture = createSevenComponentArchitecture({ regional: true });
const baseline = evaluate(baselineArchitecture);
const cdnLine = baseline.cost.lineItems.find((line) => line.componentId === "cdn");
assert.ok(cdnLine && cdnLine.amount > 0);
assert.equal(baseline.traffic.cdn.incomingRps, level1CompositionChallenge.workload.requestsPerSecond);

console.log("Check — moving the primary far from writers increases transfer cost");
const remotePrimaryArchitecture = createSevenComponentArchitecture({ regional: true });
remotePrimaryArchitecture.components = remotePrimaryArchitecture.components.map((component) =>
  component.id === "postgres"
    ? {
        ...component,
        deployments: component.deployments.map((deployment) =>
          deployment.id === "postgres-primary" ? { ...deployment, regionId: "singapore" } : deployment,
        ),
      }
    : component,
);
const remotePrimary = evaluate(remotePrimaryArchitecture);
assert.ok(remotePrimary.cost.monthlyTotal > baseline.cost.monthlyTotal);
assert.ok(
  remotePrimary.cost.lineItems.some((line) => line.componentId === "xfer:europe->singapore"),
  "remote primary must add cross-region write transfer",
);

console.log("Check — geo passer remains within the Level 1 budget");
assert.ok(baseline.cost.monthlyTotal <= 85_000);

console.log("geo cost verified");
