import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { logicalCapacitySummary } from "../features/architecture-canvas/view-mode.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasDir = join(root, "features/architecture-canvas");

function readCanvasModule(name) {
  return readFileSync(join(canvasDir, name), "utf8");
}

const serviceLogical = {
  id: "service-01",
  type: "service",
  config: { size: "medium", instances: 9 },
  deployments: [],
  ui: { x: 0, y: 0 },
};
assert.equal(logicalCapacitySummary(serviceLogical), "9 instances");

const serviceRegional = {
  ...serviceLogical,
  deployments: [
    { id: "a", regionId: "us-east", config: { instances: 4 } },
    { id: "b", regionId: "europe", config: { instances: 3 } },
    { id: "c", regionId: "singapore", config: { instances: 2 } },
  ],
};
assert.equal(logicalCapacitySummary(serviceRegional), "9 instances · 3 regions");

const postgres = {
  id: "postgres-01",
  type: "postgres",
  config: { tier: "large", readReplicaCount: 2 },
  deployments: [
    { id: "p", regionId: "us-east", config: { role: "primary" } },
    { id: "r1", regionId: "europe", config: { role: "replica" } },
    { id: "r2", regionId: "singapore", config: { role: "replica" } },
  ],
  ui: { x: 0, y: 0 },
};
assert.equal(logicalCapacitySummary(postgres), "Primary · us-east · 2 replicas");

const redis = {
  id: "redis-01",
  type: "redis",
  config: { mode: "standalone", tier: "medium", ttlBand: "medium" },
  deployments: [
    { id: "r-a", regionId: "us-east", config: {} },
    { id: "r-b", regionId: "europe", config: {} },
  ],
  ui: { x: 0, y: 0 },
};
assert.equal(logicalCapacitySummary(redis), "2 regions");

const playgroundSource = [
  "ArchitectureCanvas.tsx",
  "PlaygroundCanvas.tsx",
  "usePlaygroundWorkspace.ts",
]
  .map(readCanvasModule)
  .join("\n");

assert.match(playgroundSource, /Logical/);
assert.match(playgroundSource, /World/);
assert.match(playgroundSource, /useState<"logical" \| "world">/);
assert.match(playgroundSource, /<WorldMap|<PlaygroundCanvas/);
const evaluateCall = playgroundSource.match(/evaluateRequirements\(\{[\s\S]*?\}\);/);
assert.ok(evaluateCall, "expected evaluateRequirements call site");
assert.doesNotMatch(evaluateCall[0], /viewMode/);
assert.match(evaluateCall[0], /architecture,/);
assert.match(evaluateCall[0], /challenge:/);
assert.match(evaluateCall[0], /registry:/);
assert.doesNotMatch(playgroundSource, /WorldArchitecture/);
assert.doesNotMatch(playgroundSource, /worldNodes/);
assert.doesNotMatch(playgroundSource, /setArchitecture\(\s*world/);
assert.match(readCanvasModule("ArchitectureCanvas.tsx"), /playground-shell/);
assert.doesNotMatch(readFileSync(join(root, "app/globals.css"), "utf8"), /\.architecture-canvas|\.simulation-run|\.component-inspector|\.view-mode-toggle/);

const worldSource = readFileSync(join(root, "features/world-map/WorldMap.tsx"), "utf8");
assert.match(worldSource, /architecture: Architecture/);
assert.match(worldSource, /component\.deployments/);
assert.doesNotMatch(worldSource, /WorldArchitecture/);

console.log("logical/world view mode verified");
