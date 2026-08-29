import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { resolveWorkloadPaths } from "../dist/index.js";

const contract = {
  channelId: "redirect",
  ingressRoles: ["traffic-source"],
  nodes: [
    { id: "ingress", acceptedRoles: ["traffic-source"], behavior: "forward" },
    { id: "service", acceptedRoles: ["service"], behavior: "dependency" },
    { id: "store", acceptedRoles: ["postgres"], behavior: "terminal" },
  ],
  transitions: [
    { from: "ingress", to: "service", connectionTypes: ["request"] },
    { from: "service", to: "store", connectionTypes: ["read_write"] },
  ],
  terminalRules: [{ id: "origin-response", requiredNodeIds: ["service", "store"], responseKind: "redirect" }],
};

const architecture = {
  version: 1,
  components: [
    { id: "traffic", type: "traffic-source", config: { label: "Users" }, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-a", type: "service", config: { size: "medium", instances: 1 }, deployments: [], ui: { x: 1, y: 0 } },
    { id: "service-b", type: "service", config: { size: "medium", instances: 1 }, deployments: [], ui: { x: 1, y: 1 } },
    { id: "postgres", type: "postgres", config: { tier: "medium", readReplicaCount: 0 }, deployments: [], ui: { x: 2, y: 0 } },
  ],
  connections: [
    { id: "traffic-a", sourceComponentId: "traffic", sourcePortId: "request_out", targetComponentId: "service-a", targetPortId: "request_in", type: "request" },
    { id: "traffic-b", sourceComponentId: "traffic", sourcePortId: "request_out", targetComponentId: "service-b", targetPortId: "request_in", type: "request" },
    { id: "a-postgres", sourceComponentId: "service-a", sourcePortId: "database_out", targetComponentId: "postgres", targetPortId: "database_in", type: "read_write" },
  ],
};

const result = resolveWorkloadPaths({ architecture, contract, registry: componentRegistry });
assert.deepEqual(result.ingressComponentIds, ["traffic"]);
assert.deepEqual(result.inactiveComponentIds, []);
assert.equal(result.paths.filter((path) => path.status === "complete").length, 1);
assert.ok(result.paths.some((path) => path.componentIds.includes("service-a") && path.status === "complete"));

const broken = result.paths.find((path) => path.componentIds.includes("service-b"));
assert.equal(broken?.status, "failed");
assert.match(broken?.failureReason ?? "", /no valid downstream completion path/);

const disconnected = resolveWorkloadPaths({
  architecture: {
    ...architecture,
    components: [...architecture.components, { id: "service-c", type: "service", config: { size: "medium", instances: 1 }, deployments: [], ui: { x: 4, y: 4 } }],
  },
  contract,
  registry: componentRegistry,
});
assert.deepEqual(disconnected.inactiveComponentIds, ["service-c"]);

assert.throws(() => resolveWorkloadPaths({ architecture, contract: { ...contract, transitions: [{ from: "missing", to: "service", connectionTypes: ["request"] }] }, registry: componentRegistry }), /invalid transition endpoint/);

console.log("simulator workload path resolution verified");
