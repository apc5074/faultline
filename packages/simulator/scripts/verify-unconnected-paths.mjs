import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { urlShortenerChallenge } from "@faultline/challenges";
import {
  estimateMonthlyCost,
  evaluateHotKeyScenario,
  evaluateRequirements,
  propagateTraffic,
} from "../dist/index.js";
import { createSevenComponentArchitecture } from "./fixtures/level1-composition.mjs";

const architecture = {
  version: 1,
  components: [
    { id: "traffic", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "lb", type: "load-balancer", config: { policy: "equal" }, deployments: [], ui: { x: 1, y: 0 } },
    { id: "service-a", type: "service", config: { size: "large", instances: 10 }, deployments: [], ui: { x: 2, y: -1 } },
    { id: "service-b", type: "service", config: { size: "large", instances: 10 }, deployments: [], ui: { x: 2, y: 1 } },
    { id: "postgres", type: "postgres", config: { tier: "large", readReplicaCount: 0 }, deployments: [], ui: { x: 3, y: -1 } },
  ],
  connections: [
    { id: "traffic-lb", sourceComponentId: "traffic", sourcePortId: "request_out", targetComponentId: "lb", targetPortId: "request_in", type: "request" },
    { id: "lb-a", sourceComponentId: "lb", sourcePortId: "request_out", targetComponentId: "service-a", targetPortId: "request_in", type: "request" },
    { id: "lb-b", sourceComponentId: "lb", sourcePortId: "request_out", targetComponentId: "service-b", targetPortId: "request_in", type: "request" },
    { id: "a-postgres", sourceComponentId: "service-a", sourcePortId: "database_out", targetComponentId: "postgres", targetPortId: "database_in", type: "read_write" },
  ],
};

const result = propagateTraffic({ architecture, challenge: urlShortenerChallenge, registry: componentRegistry });
assert.equal(result.valid, true);
if (!result.valid) throw new Error("Expected valid architecture.");
assert.ok(result.unroutableRps > 0, "broken Service branch must be end-to-end failure traffic");
const redirectPaths = result.workloadPaths?.redirect?.paths ?? [];
assert.ok(redirectPaths.some((path) => path.status === "complete"));
assert.ok(redirectPaths.some((path) => path.status === "failed" && path.componentIds.includes("service-b")));

const hotKey = evaluateHotKeyScenario({ architecture, challenge: urlShortenerChallenge, registry: componentRegistry });
assert.equal(hotKey.valid, true);
if (!hotKey.valid) throw new Error("Expected valid hot-key evaluation.");
assert.ok(hotKey.hotKey.incompleteComponentIds.includes("service-b"));
assert.equal(hotKey.hotKey.passed, false);

const requirements = evaluateRequirements({ architecture, challenge: urlShortenerChallenge, registry: componentRegistry });
assert.equal(requirements.valid, true);
if (!requirements.valid) throw new Error("Expected valid requirements evaluation.");
assert.ok(requirements.workloadPaths?.redirect?.paths.some((path) => path.status === "failed"));

// Geographic propagation must apply the same completion rule. Redis may
// receive regional traffic, but without an origin store its misses/writes are
// not successful database work and must become explicit failure traffic.
const geographicBrokenRedis = createSevenComponentArchitecture({ regional: true });
geographicBrokenRedis.connections = geographicBrokenRedis.connections.filter(
  (connection) => connection.id !== "redis-postgres",
);
const geographicResult = propagateTraffic({
  architecture: geographicBrokenRedis,
  challenge: urlShortenerChallenge,
  registry: componentRegistry,
});
assert.equal(geographicResult.valid, true);
if (!geographicResult.valid) throw new Error("Expected valid geographic broken-cache architecture.");
assert.ok(geographicResult.traffic.redis.readRps > 0);
assert.equal(geographicResult.traffic.postgres.incomingRps, 0);
assert.ok(geographicResult.unroutableRps > 0, "geographic cache misses must remain incomplete");
assert.ok(
  geographicResult.workloadPaths?.redirect?.paths.some((path) => path.status === "failed"),
  "geographic path evidence must include the broken cache branch",
);

// Disconnected infrastructure still costs money, but it cannot manufacture
// usage or capacity evidence. This keeps budget pressure honest while the
// completion-aware metrics reject the idle branch.
const idleRedisArchitecture = createSevenComponentArchitecture({ includeIdleRedis: true });
const idleRedisCost = estimateMonthlyCost({
  architecture: idleRedisArchitecture,
  registry: componentRegistry,
});
assert.ok(idleRedisCost.lineItems.some((item) => item.componentId === "redis-idle"));

console.log("unconnected Level 1 workload paths verified");
