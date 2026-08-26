import assert from "node:assert/strict";
import { hashChallengeConfig, canonicalizeJson, urlShortenerChallenge, tinyApiChallenge } from "../dist/index.js";

const first = hashChallengeConfig(urlShortenerChallenge);
const second = hashChallengeConfig(urlShortenerChallenge);
assert.equal(first, second);
assert.equal(first.length, 64);
assert.match(first, /^[a-f0-9]+$/);

const tiny = hashChallengeConfig(tinyApiChallenge);
assert.notEqual(tiny, first);

const scrambled = {
  ...urlShortenerChallenge,
  requirements: [...urlShortenerChallenge.requirements].reverse(),
};
// Canonicalization sorts object keys but preserves array order (semantic).
assert.notEqual(hashChallengeConfig(scrambled), first);

const canonical = canonicalizeJson({ b: 1, a: { d: 2, c: 3 } });
assert.deepEqual(canonical, { a: { c: 3, d: 2 }, b: 1 });

console.log("challenge config hash verified");
console.log(`url-shortener hash=${first}`);
