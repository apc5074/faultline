import assert from "node:assert/strict";

import { componentRegistry } from "@faultline/component-catalog";
import { GLYPH_SIZES } from "../features/playground-glyphs/glyph-sizes.ts";
import { GLYPH_STATES, GLYPH_TYPES } from "../features/playground-glyphs/glyph-types.ts";
import { outlineProps } from "../features/playground-glyphs/glyph-outline.ts";
import { GLYPH_STATIC_FIXTURES } from "../features/playground-glyphs/static-fixtures.ts";

const dormantTypes = ["dns", "api_gateway", "nosql_db", "pubsub"];
const activeLevel2Types = ["queue", "object_storage"];
for (const glyph of GLYPH_TYPES) {
  assert.ok(GLYPH_STATIC_FIXTURES[glyph], `${glyph} needs a static fixture`);
  assert.ok(GLYPH_SIZES[glyph].w > 0 && GLYPH_SIZES[glyph].h > 0, `${glyph} needs dimensions`);
}

for (const state of GLYPH_STATES) assert.ok(outlineProps(state).stroke, `${state} needs a shared outline state`);

for (const type of dormantTypes) {
  assert.equal(
    componentRegistry.list().some((definition) => definition.presentation.glyph === type),
    false,
    `${type} must remain dormant in the catalog`,
  );
}

for (const type of activeLevel2Types) {
  assert.equal(
    componentRegistry.list().some((definition) => definition.presentation.glyph === type),
    true,
    `${type} must be registered for Level 2`,
  );
}

console.log("glyph family fixtures verified");
