import assert from "node:assert/strict";

import {
  ALIAS_ADJECTIVES,
  ALIAS_NOUNS,
  generateAlias,
  isValidAliasFormat,
} from "../lib/auth/alias.ts";

assert.ok(ALIAS_ADJECTIVES.length >= 10);
assert.ok(ALIAS_NOUNS.length >= 10);

const samples = new Set<string>();
for (let index = 0; index < 200; index += 1) {
  const alias = generateAlias(() => Math.random());
  assert.equal(isValidAliasFormat(alias), true, alias);
  assert.equal(/[0-9a-f-]{8,}/i.test(alias), false, "alias must not look like a UUID fragment");
  samples.add(alias);
}

assert.ok(samples.size > 50, "generator should produce varied aliases");

const fixed = generateAlias(() => 0);
assert.equal(fixed, `${ALIAS_ADJECTIVES[0]}${ALIAS_NOUNS[0]}00`);
assert.equal(isValidAliasFormat(fixed), true);

console.log("alias generator verified");
