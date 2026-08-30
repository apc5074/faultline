import assert from "node:assert/strict";
import { componentRegistry } from "@faultline/component-catalog";
import { inspectComponentOption } from "../dist/capabilities/inspect-component-option.js";

const level1Types = ["traffic-source", "global-router", "load-balancer", "service", "cdn", "redis", "postgres"];
const context = { challenge: { slug: "url-shortener", version: 1, allowedComponentTypes: level1Types } };

const listed = inspectComponentOption(context, {});
assert.equal(listed.ok, true);
assert.equal(listed.data.kind, "component_options");
assert.deepEqual(listed.data.options.map((option) => option.type), level1Types);
assert.equal(listed.data.options.some((option) => option.type === "queue"), false);

for (const type of level1Types) {
  const result = inspectComponentOption(context, { type });
  assert.equal(result.ok, true);
  const option = result.data.option;
  const definition = componentRegistry.get(type);
  assert.equal(option.displayName, definition.label);
  assert.equal(option.configFields.length, definition.agentFacts.configFields.length);
  assert.deepEqual(option.configFields.map((field) => field.key), Object.keys(definition.defaultConfig));
  assert.deepEqual(option.configFields.map((field) => field.defaultValue), Object.values(definition.defaultConfig));
}

assert.equal(inspectComponentOption(context, { type: "queue" }).ok, false);
assert.equal(inspectComponentOption(context, { type: "missing" }).ok, false);
const changedRevision = inspectComponentOption({ challenge: context.challenge, architecture: { components: [] } }, { type: "redis" });
assert.equal(changedRevision.ok, true, "catalog facts must not depend on architecture revisions");
console.log("inspect_component_option verification passed");
