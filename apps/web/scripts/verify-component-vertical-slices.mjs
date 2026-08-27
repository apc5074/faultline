/** COMP-008 — compact vertical-slice guard for every registered component. */
import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { evaluateRequirements } from "@faultline/simulator";
import { urlShortenerChallenge } from "@faultline/challenges";

import { activeChallenge, activeLevelStarterArchitecture } from "../features/architecture-canvas/playground-challenge.ts";
import { glyphDimensionsForProps, glyphPropsFromComponent } from "../features/playground-glyphs/catalog-map.ts";
import { glyphFamilyRegistry, hasGlyphFamily } from "../features/playground-glyphs/glyph-registry.ts";
import { selectComponentVisualEvidence } from "../features/traffic-playback/component-visual-evidence.ts";

function fixture(definition) {
  const parsed = definition.configSchema.safeParse(structuredClone(definition.defaultConfig));
  assert.equal(parsed.success, true, `${definition.type}: default config must validate`);
  return { id: `fixture-${definition.type}`, type: definition.type, config: parsed.data, deployments: [], ui: { x: 0, y: 0 } };
}

for (const definition of componentRegistry.list()) {
  const component = fixture(definition);
  assert.ok(hasGlyphFamily(definition.presentation.glyph), `${definition.type}: glyph family`);
  assert.equal(typeof glyphFamilyRegistry[definition.presentation.glyph], "function");
  const props = glyphPropsFromComponent(component, definition);
  const dimensions = glyphDimensionsForProps(props);
  assert.ok(dimensions.width > 0 && dimensions.height > 0, `${definition.type}: glyph dimensions`);
  for (const port of definition.ports) assert.ok(port.connectionTypes.length > 0, `${definition.type}:${port.id}: typed port`);
  const neutral = selectComponentVisualEvidence({ component, simulation: null, redirectRps: 1 });
  assert.equal(neutral.processingCount, 0, `${definition.type}: neutral without simulator evidence`);
}

for (const type of activeChallenge.allowedComponentTypes) assert.ok(componentRegistry.has(type), `${type}: active allow-list registry entry`);
const result = evaluateRequirements({ architecture: activeLevelStarterArchitecture(), challenge: urlShortenerChallenge, registry: componentRegistry });
assert.equal(result.valid, true, "Level 1 starter remains simulatable");

console.log("component vertical slices verified");
