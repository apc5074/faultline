import assert from "node:assert/strict";
import {
  hashArchitecture,
  hashChallengeConfig,
  canonicalizeJson,
  urlShortenerChallenge,
  tinyApiChallenge,
} from "../dist/index.js";

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

const sampleArchitecture = {
  version: 1,
  components: [
    {
      id: "svc",
      type: "service",
      config: { size: "S" },
      deployments: [{ regionId: "us-east-1", instances: 1 }],
    },
  ],
  connections: [],
};
const archHash = hashArchitecture(sampleArchitecture);
assert.equal(archHash, hashArchitecture(sampleArchitecture));
assert.equal(archHash.length, 64);
assert.notEqual(
  archHash,
  hashArchitecture({
    ...sampleArchitecture,
    components: [
      {
        ...sampleArchitecture.components[0],
        config: { size: "M" },
      },
    ],
  }),
);

console.log("challenge config hash verified");
console.log(`url-shortener hash=${first}`);
console.log(`architecture hash sample=${archHash}`);
