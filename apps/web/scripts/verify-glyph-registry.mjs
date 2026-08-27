import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import {
  glyphDimensionsForProps,
  glyphPropsFromComponent,
} from "../features/playground-glyphs/catalog-map.ts";
import { glyphFamilyRegistry, hasGlyphFamily } from "../features/playground-glyphs/glyph-registry.ts";

function sampleComponent(definition) {
  return {
    id: `sample-${definition.type}`,
    type: definition.type,
    config: definition.defaultConfig,
    deployments: [],
    ui: { x: 0, y: 0 },
  };
}

for (const definition of componentRegistry.list()) {
  const { glyph } = definition.presentation;
  assert.equal(hasGlyphFamily(glyph), true, `${definition.type} must have a registered glyph family`);

  const props = glyphPropsFromComponent(sampleComponent(definition), definition);
  assert.equal(props.type, glyph, `${definition.type} descriptor should select its glyph family`);
  const dimensions = glyphDimensionsForProps(props);
  assert.ok(dimensions.width > 0 && dimensions.height > 0, `${definition.type} should have dimensions`);
  assert.equal(typeof glyphFamilyRegistry[glyph], "function");
}

const service = componentRegistry.get("service");
const serviceProps = glyphPropsFromComponent(
  {
    ...sampleComponent(service),
    deployments: [
      { id: "east", regionId: "us-east", config: { instances: 2 } },
      { id: "west", regionId: "us-west", config: { instances: 3 } },
    ],
  },
  service,
);
assert.equal(serviceProps.type, "server");
assert.equal(serviceProps.instances, 5);

const postgres = componentRegistry.get("postgres");
const postgresProps = glyphPropsFromComponent(
  {
    ...sampleComponent(postgres),
    config: { tier: "small", readReplicaCount: 1 },
    deployments: [
      { id: "primary", regionId: "us-east", config: { role: "primary" } },
      { id: "replica-a", regionId: "us-west", config: { role: "replica" } },
      { id: "replica-b", regionId: "eu-west", config: { role: "replica" } },
    ],
  },
  postgres,
);
assert.equal(postgresProps.type, "sql_db");
assert.equal(postgresProps.replicas, 2);

const unknownDefinition = { ...service, presentation: { ...service.presentation, glyph: "unregistered_family" } };
const fallback = glyphPropsFromComponent(sampleComponent(service), unknownDefinition);
assert.deepEqual(fallback, { type: "fallback", fallbackLabel: service.label });

console.log("glyph registry verified");
