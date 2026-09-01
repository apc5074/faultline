import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultCapabilityRegistry } from "@faultline/agent-capabilities";
import { urlShortenerChallenge } from "@faultline/challenges";

import { createAgentContext } from "../lib/agent-context/create-agent-context.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = readFileSync(join(root, "lib/experiments/launch-experiment.ts"), "utf8");
const publisher = readFileSync(join(root, "lib/experiments/experiment-result-publisher.ts"), "utf8");
const controls = readFileSync(join(root, "features/experiments/DevExperimentControls.tsx"), "utf8");
const canvas = readFileSync(join(root, "features/architecture-canvas/ArchitectureCanvas.tsx"), "utf8");

assert.match(launcher, /createDefaultCapabilityRegistry/);
assert.match(launcher, /createAgentContext/);
assert.match(launcher, /\.invoke\(/);
assert.match(launcher, /publishExperimentResult/);
assert.match(launcher, /run_load_test/);
assert.match(launcher, /change_traffic_pattern/);
assert.match(launcher, /flush_cache/);
assert.match(launcher, /inject_component_failure/);
assert.match(launcher, /inject_region_failure/);
assert.doesNotMatch(launcher, /evaluateExperiment/);
assert.match(publisher, /publishExperimentResult/);
assert.match(controls, /launchExperiment/);
assert.doesNotMatch(controls, /evaluateExperiment/);
assert.match(canvas, /publishExperimentResult/);
assert.match(canvas, /onExperimentResult=\{publishResult\}/);

const architecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
  ],
  connections: [
    {
      id: "traffic-service",
      sourceComponentId: "traffic-01",
      sourcePortId: "request_out",
      targetComponentId: "service-01",
      targetPortId: "request_in",
      type: "request",
    },
    {
      id: "service-postgres",
      sourceComponentId: "service-01",
      sourcePortId: "database_out",
      targetComponentId: "postgres-01",
      targetPortId: "database_in",
      type: "read_write",
    },
  ],
};

const registry = createDefaultCapabilityRegistry();
const context = createAgentContext(architecture, urlShortenerChallenge);
const invoked = await registry.invoke("run_load_test", context, { multiplier: 2 });
assert.equal(invoked.ok, true);
if (!invoked.ok) throw new Error("expected successful capability invoke");
assert.equal(invoked.data.type, "traffic_multiplier");
assert.equal(invoked.data.simulated, true);
assert.equal(invoked.data.nonPersistent, true);

console.log("shared experiment launcher verified");
