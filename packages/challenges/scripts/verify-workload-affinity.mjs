import assert from "node:assert/strict";
import {
  ChallengeDefinitionError,
  assertChallengeDefinition,
  hashChallengeConfig,
  tinyApiChallenge,
  urlShortenerChallenge,
} from "../dist/index.js";

// url-shortener ships authored workloadAffinity; tiny-api omits it (legacy ceilings).
assert.ok(urlShortenerChallenge.workloadAffinity);
assert.equal(tinyApiChallenge.workloadAffinity, undefined);
assertChallengeDefinition(urlShortenerChallenge);
assertChallengeDefinition(tinyApiChallenge);

const urlShortenerHash = hashChallengeConfig(urlShortenerChallenge);
const tinyApiHash = hashChallengeConfig(tinyApiChallenge);

// Omitting workloadAffinity on tiny-api must not change its hash.
const { workloadAffinity: _omit, ...tinyWithoutAffinityKey } = { ...tinyApiChallenge, workloadAffinity: undefined };
assert.equal(hashChallengeConfig(tinyWithoutAffinityKey), tinyApiHash);

// A valid workloadAffinity on tiny-api parses and changes the hash.
const validAffinity = {
  roleDefaults: {
    unreachable: 0,
    misplaced: 0.05,
  },
  mechanisms: {
    edge_cache: {
      maxEffectiveness: 0.85,
      byRole: { edge_ingress: 1.0, path_middleware: 0.4, misplaced: 0.05 },
      reuseConcentration: 0.7,
      note: "Redirects are highly edge-cacheable when CDN sits on the user path.",
    },
    data_cache: {
      maxEffectiveness: 0.3,
      byRole: { read_aside: 1.0, edge_ingress: 0.25 },
      defaultRoleMultiplier: 0.1,
    },
  },
};

const tinyWithAffinity = { ...tinyApiChallenge, workloadAffinity: validAffinity };
assertChallengeDefinition(tinyWithAffinity);
const affinityHash = hashChallengeConfig(tinyWithAffinity);
assert.notEqual(affinityHash, tinyApiHash);

// Changing a role table changes the hash again.
const withChangedRole = {
  ...tinyApiChallenge,
  workloadAffinity: {
    ...validAffinity,
    mechanisms: {
      ...validAffinity.mechanisms,
      edge_cache: { ...validAffinity.mechanisms.edge_cache, byRole: { edge_ingress: 0.9 } },
    },
  },
};
assertChallengeDefinition(withChangedRole);
assert.notEqual(hashChallengeConfig(withChangedRole), affinityHash);

// Re-hashing identical affinity config is stable.
assert.equal(hashChallengeConfig({ ...tinyApiChallenge, workloadAffinity: validAffinity }), affinityHash);

function expectRejected(overrideAffinity, label) {
  assert.throws(
    () => assertChallengeDefinition({ ...tinyApiChallenge, workloadAffinity: overrideAffinity }),
    ChallengeDefinitionError,
    label,
  );
}

// Unknown mechanism key rejected.
expectRejected({ mechanisms: { made_up_mechanism: { maxEffectiveness: 1 } } }, "unknown mechanism key");

// Unknown role key rejected (byRole).
expectRejected(
  { mechanisms: { edge_cache: { maxEffectiveness: 1, byRole: { made_up_role: 1 } } } },
  "unknown role key in byRole",
);

// Unknown role key rejected (roleDefaults).
expectRejected(
  { mechanisms: { edge_cache: { maxEffectiveness: 1 } }, roleDefaults: { made_up_role: 0 } },
  "unknown role key in roleDefaults",
);

// maxEffectiveness out of range rejected.
expectRejected({ mechanisms: { edge_cache: { maxEffectiveness: 1.5 } } }, "maxEffectiveness above 1");
expectRejected({ mechanisms: { edge_cache: { maxEffectiveness: -0.1 } } }, "maxEffectiveness below 0");

// byRole value out of range rejected.
expectRejected(
  { mechanisms: { edge_cache: { maxEffectiveness: 0.5, byRole: { edge_ingress: 1.2 } } } },
  "byRole value above 1",
);

// reuseConcentration out of range rejected.
expectRejected(
  { mechanisms: { edge_cache: { maxEffectiveness: 0.5, reuseConcentration: 2 } } },
  "reuseConcentration above 1",
);

// roleDefaults value out of range rejected.
expectRejected(
  { mechanisms: { edge_cache: { maxEffectiveness: 0.5 } }, roleDefaults: { misplaced: -1 } },
  "roleDefaults value below 0",
);

// Empty mechanisms rejected when workloadAffinity is present.
expectRejected({ mechanisms: {} }, "empty mechanisms map");

console.log("workload affinity verified");
console.log(`url-shortener hash=${urlShortenerHash}`);
console.log(`tiny-api hash=${tinyApiHash}`);
console.log(`tiny-api + affinity hash=${affinityHash}`);
