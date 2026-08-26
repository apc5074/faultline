import assert from "node:assert/strict";
import { checkConnectionCompatibility, validateArchitecture } from "../dist/index.js";

const architecture = {
  version: 1,
  components: [
    { id: "traffic-01", type: "traffic-source", config: {}, deployments: [], ui: { x: 0, y: 0 } },
    { id: "service-01", type: "service", config: { instances: 4 }, deployments: [], ui: { x: 240, y: 0 } },
    { id: "postgres-01", type: "postgres", config: { tier: "medium" }, deployments: [], ui: { x: 480, y: 0 } },
  ],
  connections: [
    { id: "traffic-service", sourceComponentId: "traffic-01", sourcePortId: "request_out", targetComponentId: "service-01", targetPortId: "request_in", type: "request" },
    { id: "service-postgres", sourceComponentId: "service-01", sourcePortId: "database_out", targetComponentId: "postgres-01", targetPortId: "database_in", type: "read_write" },
  ],
};

const roundTripped = JSON.parse(JSON.stringify(architecture));
assert.deepEqual(roundTripped, architecture);
assert.equal(validateArchitecture(roundTripped).success, true);

const beforeMove = JSON.stringify({ components: architecture.components.map(({ id, type, config, deployments }) => ({ id, type, config, deployments })), connections: architecture.connections });
architecture.components[1].ui = { x: 900, y: 700 };
const afterMove = JSON.stringify({ components: architecture.components.map(({ id, type, config, deployments }) => ({ id, type, config, deployments })), connections: architecture.connections });
assert.equal(afterMove, beforeMove);

assert.equal(validateArchitecture({ ...architecture, components: [...architecture.components, architecture.components[0]] }).success, false);

const trafficRequestOut = { id: "request_out", label: "Requests", direction: "output", connectionTypes: ["request"] };
const serviceRequestIn = { id: "request_in", label: "Requests", direction: "input", connectionTypes: ["request"] };
const serviceDatabaseOut = { id: "database_out", label: "Database", direction: "output", connectionTypes: ["read_write"] };
const postgresDatabaseIn = { id: "database_in", label: "Database", direction: "input", connectionTypes: ["read_write"] };

assert.equal(checkConnectionCompatibility(trafficRequestOut, serviceRequestIn, "request").valid, true);
assert.equal(checkConnectionCompatibility(serviceDatabaseOut, postgresDatabaseIn, "read_write").valid, true);
assert.equal(checkConnectionCompatibility(postgresDatabaseIn, trafficRequestOut, "request").valid, false);
assert.equal(checkConnectionCompatibility(trafficRequestOut, postgresDatabaseIn, "request").valid, false);
console.log("architecture contract verified");
