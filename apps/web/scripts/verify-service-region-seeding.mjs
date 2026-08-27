/** GEO-11 — Service regional seeding stays bounded and follows origin shares. */
import assert from "node:assert/strict";

import { urlShortenerChallenge } from "@faultline/challenges";
import { totalServiceInstancesFromDeployments } from "@faultline/core";
import { seedServiceDeploymentsByOrigin } from "../features/architecture-canvas/region-enclosures.ts";

const seeded = seedServiceDeploymentsByOrigin(10, "service-1", urlShortenerChallenge.geographicDistribution);
assert.equal(totalServiceInstancesFromDeployments(seeded), 10);
assert.equal(seeded.length, 6);
assert.equal(seeded.find((deployment) => deployment.regionId === "us-east")?.config.instances, 2);
assert.equal(seeded.find((deployment) => deployment.regionId === "europe")?.config.instances, 3);
assert.ok(seeded.every((deployment) => deployment.config.instances > 0));

const bounded = seedServiceDeploymentsByOrigin(50, "service-1", urlShortenerChallenge.geographicDistribution);
assert.equal(totalServiceInstancesFromDeployments(bounded), 10);

const fallback = seedServiceDeploymentsByOrigin(4, "service-1", undefined);
assert.deepEqual(fallback.map((deployment) => deployment.regionId), ["us-east"]);
assert.equal(fallback[0].config.instances, 4);

console.log("service regional seeding verified");
