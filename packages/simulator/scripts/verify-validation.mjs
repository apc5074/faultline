import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { tinyApiChallenge } from "@faultline/challenges";
import { validateArchitectureForSimulation } from "../dist/index.js";

const components = [
  { id: "traffic-01", type: "traffic-source", config: { label: "Incoming traffic" }, deployments: [], ui: { x: 0, y: 0 } },
  { id: "service-01", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 300, y: 0 } },
  { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 600, y: 0 } },
];

const validArchitecture = {
  version: 1,
  components,
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "service-postgres", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
};

const validate = (architecture) => validateArchitectureForSimulation({ architecture, challenge: tinyApiChallenge, registry: componentRegistry });

assert.equal(validate(validArchitecture).valid, true);
assert.equal(validate({ ...validArchitecture, connections: [{ id: "traffic-postgres", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "request" }] }).valid, false);
assert.equal(validate({ ...validArchitecture, connections: [{ id: "missing", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "missing-id", targetPortId: "database_in", type: "read_write" }] }).valid, false);
assert.equal(validate({ ...validArchitecture, components: [...components, components[0]] }).valid, false);
assert.equal(validate({ ...validArchitecture, components: components.map((component) => component.id === "service-01" ? { ...component, config: { instances: 11 } } : component) }).valid, false);
console.log("simulator architecture validation verified");
