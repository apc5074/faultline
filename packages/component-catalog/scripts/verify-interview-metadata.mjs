import assert from "node:assert/strict";
import { assertComponentDefinition, componentRegistry, serviceDefinition } from "../dist/index.js";

assert.deepEqual(serviceDefinition.interview.scale.safeValues, [1, 2, 3, 4]);
assert.equal(serviceDefinition.interview.failure.scopes[0], "component");
assert.equal(componentRegistry.get("redis").interview, undefined);
const invalid = { ...serviceDefinition, type: "invalid-interview", interview: { scale: { configPath: "not-a-field", safeValues: [1, 2], earlyCareerEditCap: 1 } } };
assert.throws(() => assertComponentDefinition(invalid), /invalid interview metadata/);
const invalidValue = { ...serviceDefinition, type: "invalid-interview-value", interview: { scale: { configPath: "instances", safeValues: [1, 99], earlyCareerEditCap: 1 } } };
assert.throws(() => assertComponentDefinition(invalidValue), /invalid interview metadata/);
const invalidFailure = { ...serviceDefinition, type: "invalid-interview-failure", interview: { failure: { scopes: ["component"], recoveryEditClasses: ["unknown"], earlyCareerEditCap: 1 } } };
assert.throws(() => assertComponentDefinition(invalidFailure), /invalid interview metadata/);
console.log("verify-interview-metadata: ok");
