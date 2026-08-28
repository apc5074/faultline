import assert from "node:assert/strict";
import {
  LevelProfileError,
  assertLevelProfile,
  allowedComponentTypesFromLevelProfile,
  challengeShapedFieldsFromLevelProfile,
} from "../dist/index.js";

function minimalProfile(overrides = {}) {
  return {
    schemaVersion: 1,
    identity: {
      slug: "url-shortener",
      version: 2,
      title: "Global URL Shortener",
      prompt:
        "Design infrastructure for a global URL shortening service. It must absorb heavy redirect traffic, accept new links, survive a viral short URL, and stay within latency, capacity headroom, and monthly budget — without a prescribed topology.",
      developmentOnly: false,
    },
    narrative: {
      hook: "LinkVault MVP goes viral at 124k RPS on an $85k board.",
      stakes: "First Run fails so players scale what exists.",
      briefingBeats: ["Geo matters", "Hot key is separate", "Budget forces efficiency", "Placement matters"],
      outOfScope: ["Queue", "Worker", "Event Stream", "Rate Limiter"],
    },
    sandbox: {
      components: [
        {
          type: "traffic-source",
          whyHere: "Challenge-owned demand injector",
          pros: ["Defines the workload"],
          cons: ["Not configurable"],
          commonMistakes: ["Trying to dial traffic"],
          placementIntent: "Ingress of challenge demand",
        },
        {
          type: "service",
          whyHere: "Stateless compute",
          pros: ["Scales out"],
          cons: ["Hot region can saturate"],
          commonMistakes: ["Undersizing under viral load"],
          placementIntent: "On the request path",
          costNotes: "Size and instance count drive monthly cost",
        },
        {
          type: "postgres",
          whyHere: "Durable store",
          pros: ["Authoritative data"],
          cons: ["Writes hit primary"],
          commonMistakes: ["Expecting replicas to shard one viral key"],
          placementIntent: "Terminal on read_write path",
        },
        {
          type: "cdn",
          whyHere: "Edge redirect offload",
          pros: ["High leverage for average redirects"],
          cons: ["Writes always miss"],
          commonMistakes: ["Placing behind Service"],
          placementIntent: "Before Service on the user path",
        },
        {
          type: "redis",
          whyHere: "Viral relief valve beside the DB",
          pros: ["Helps hot-key reads"],
          cons: ["Limited average offload"],
          commonMistakes: ["Using Redis as an edge CDN"],
          placementIntent: "Read-aside beside Postgres",
        },
      ],
    },
    workload: {
      requestsPerSecond: 124_000,
      readRatio: 120_000 / 124_000,
      writeRatio: 4_000 / 124_000,
      hotKeyReadFraction: 0.25,
    },
    geographicDistribution: [
      { regionId: "us-east", fraction: 0.25 },
      { regionId: "us-west", fraction: 0.2 },
      { regionId: "europe", fraction: 0.25 },
      { regionId: "india", fraction: 0.1 },
      { regionId: "singapore", fraction: 0.1 },
      { regionId: "tokyo", fraction: 0.1 },
    ],
    transferPayload: {
      redirectResponseBytes: 800,
      writeRequestBytes: 1_200,
      databaseReadBytes: 1_024,
      databaseWriteBytes: 512,
      replicationBytesPerWrite: 512,
    },
    scoring: {
      requirements: [
        { id: "throughput", label: "Throughput", type: "throughput", comparator: "gte", target: 1, unit: "ratio" },
        { id: "latency", label: "Redirect p95 latency", type: "latency", comparator: "lt", target: 150, unit: "ms" },
        { id: "headroom", label: "Capacity headroom", type: "headroom", comparator: "gte", target: 0.1, unit: "ratio" },
        {
          id: "budget",
          label: "Monthly infrastructure budget",
          type: "budget",
          comparator: "lte",
          target: 85_000,
          unit: "usd/month",
        },
      ],
      monthlyBudget: 85_000,
      unscoredTargets: [
        {
          id: "availability",
          label: "Availability",
          target: 0.9999,
          unit: "ratio",
          reason: "Deferred until truthful resilience semantics exist.",
        },
      ],
      hotKeyGateNote: "30k RPS on one key must not saturate Redis hot-path or Postgres primary reads.",
    },
    coachingPolicy: {
      focusThemes: [
        "hot-key resilience",
        "read scaling",
        "global latency",
        "cache-workload-fit",
        "placement-fit",
        "mechanism-fit",
      ],
      prohibitedRevealCategories: [
        "canonical topology",
        "specific component requirements",
        "solution-only thresholds",
      ],
    },
    workloadAffinity: {
      roleDefaults: {
        unreachable: 0,
        misplaced: 0.05,
        write_path: 0.1,
      },
      mechanisms: {
        edge_cache: {
          maxEffectiveness: 0.88,
          byRole: { edge_ingress: 1.0, path_middleware: 0.4, misplaced: 0.05 },
          reuseConcentration: 0.7,
          note: "Redirects are highly edge-cacheable when CDN sits on the user path.",
        },
        data_cache: {
          maxEffectiveness: 0.3,
          byRole: { read_aside: 1.0, edge_ingress: 0.25, path_middleware: 0.2 },
          reuseConcentration: 0.8,
          note: "In-memory cache helps hot keys beside the DB; weak as a substitute for edge cache.",
        },
        request_fanout: {
          maxEffectiveness: 0.9,
          byRole: { path_middleware: 1.0 },
          note: "Load balancing pays off when multiple healthy upstreams exist on path.",
        },
        geo_routing: {
          maxEffectiveness: 0.85,
          byRole: { geo_route: 1.0, path_middleware: 0.5 },
          note: "Routing matters when traffic spans regions.",
        },
        stateless_compute: {
          maxEffectiveness: 1.0,
          byRole: { compute: 1.0 },
        },
        durable_store: {
          maxEffectiveness: 1.0,
          byRole: { primary_store: 1.0, replica_store: 1.0 },
          unitCostPressure: 1.0,
        },
      },
    },
    volumeProfile: {
      bands: [
        {
          mechanismId: "edge_cache",
          baselineShareOfRedirects: { min: 0.45, max: 0.85 },
          notes: "When correctly placed at edge",
        },
        {
          mechanismId: "data_cache",
          baselineShareOfRedirects: { min: 0.02, max: 0.2 },
          hotKeyShareOfRedirects: { min: 0.15, max: 0.45 },
          notes: "Average quiet; viral relief",
        },
        {
          mechanismId: "origin_compute",
          baselineShareOfRedirects: { min: 0.15, max: 0.55 },
        },
        {
          mechanismId: "durable_store",
          baselineShareOfRedirects: { min: 0.1, max: 0.5 },
        },
      ],
      rules: {
        baselineCdnOutranksDataCache: true,
        hotKeyMayEmphasizeDataCache: true,
      },
    },
    starterArchitecture: {
      version: 1,
      components: [
        {
          id: "traffic-source-start",
          type: "traffic-source",
          config: { label: "Incoming traffic" },
          deployments: [],
          ui: { x: 0, y: 0 },
        },
        {
          id: "service-start",
          type: "service",
          config: { size: "medium", instances: 3 },
          deployments: [{ id: "dep-svc-east", regionId: "us-east", config: { instances: 3 } }],
          ui: { x: 200, y: 0 },
        },
        {
          id: "postgres-start",
          type: "postgres",
          config: { tier: "medium", readReplicaCount: 0 },
          deployments: [{ id: "dep-pg-east", regionId: "us-east", config: { role: "primary" } }],
          ui: { x: 400, y: 0 },
        },
      ],
      connections: [
        {
          id: "conn-traffic-service",
          sourceComponentId: "traffic-source-start",
          sourcePortId: "request_out",
          targetComponentId: "service-start",
          targetPortId: "request_in",
          type: "request",
        },
        {
          id: "conn-service-postgres",
          sourceComponentId: "service-start",
          sourcePortId: "db_out",
          targetComponentId: "postgres-start",
          targetPortId: "db_in",
          type: "read_write",
        },
      ],
    },
    firstRunExpectation: {
      summary: "Inherited MVP is undersized for viral load — throughput, latency, and headroom fail.",
      expectedFailingRequirementIds: ["throughput", "latency", "headroom"],
      hotKeyExpectedFail: true,
    },
    playtestChecklist: [
      "Users→Service→Postgres only fails for the right reasons",
      "CDN path looks busier than Redis for average redirects",
    ],
    curriculumTags: ["geo", "hot-key", "budget-trap"],
    forbiddenMechanisms: ["async_buffer", "async_consumer"],
    ...overrides,
  };
}

assert.doesNotThrow(() => assertLevelProfile(minimalProfile()));
const profile = minimalProfile();
assertLevelProfile(profile);
assert.deepEqual(allowedComponentTypesFromLevelProfile(profile), [
  "traffic-source",
  "service",
  "postgres",
  "cdn",
  "redis",
]);

const challengeShaped = challengeShapedFieldsFromLevelProfile(profile);
assert.equal(challengeShaped.slug, "url-shortener");
assert.equal(challengeShaped.workloadAffinity?.mechanisms.data_cache?.maxEffectiveness, 0.3);
assert.equal("volumeProfile" in challengeShaped, false);
assert.equal("narrative" in challengeShaped, false);
assert.equal("starterArchitecture" in challengeShaped, false);

const multiWorkload = minimalProfile({
  workloadChannels: [
    { id: "upload", kind: "object_io", ratePerSecond: 100, bytesPerOperation: 1_000_000_000 },
    { id: "processing", kind: "async_work", ratePerSecond: 100, workUnitsPerOperation: 40 },
    { id: "playback-start", kind: "object_io", ratePerSecond: 150_000, bytesPerOperation: 1_024, hotShare: 0.6 },
  ],
  volumeProfile: {
    bands: [
      {
        mechanismId: "async_buffer",
        channelId: "processing",
        baselineShareOfChannel: { min: 0, max: 1 },
      },
    ],
    rules: {
      baselineCdnOutranksDataCache: false,
      hotKeyMayEmphasizeDataCache: false,
    },
  },
});
assert.doesNotThrow(() => assertLevelProfile(multiWorkload));
assert.equal(challengeShapedFieldsFromLevelProfile(multiWorkload).workloadChannels?.[1].workUnitsPerOperation, 40);

function rejects(mutator, pattern) {
  const candidate = minimalProfile();
  mutator(candidate);
  assert.throws(() => assertLevelProfile(candidate), (error) => {
    assert.ok(error instanceof LevelProfileError);
    assert.match(error.message, pattern);
    return true;
  });
}

rejects((profile) => {
  delete profile.workload;
}, /workload/i);

rejects((profile) => {
  profile.sandbox.components.push({
    type: "service",
    whyHere: "dup",
    pros: ["a"],
    cons: ["b"],
    commonMistakes: ["c"],
    placementIntent: "x",
  });
}, /duplicate type/i);

rejects((profile) => {
  profile.requiredComponents = ["cdn"];
}, /topology-scoring|requiredComponents/i);

rejects((profile) => {
  profile.canonicalTopology = { edges: [] };
}, /topology-scoring|canonicalTopology/i);

rejects((profile) => {
  profile.volumeProfile.bands[0].baselineShareOfRedirects = { min: 0.9, max: 0.1 };
}, /0 <= min <= max <= 1/);

rejects((profile) => {
  profile.unexpectedField = true;
}, /unknown top-level key/i);

rejects((profile) => {
  profile.firstRunExpectation.expectedFailingRequirementIds = ["not-a-real-id"];
}, /unknown requirement/i);

rejects((profile) => {
  profile.sandbox.components = profile.sandbox.components.filter((component) => component.type !== "traffic-source");
}, /traffic-source/);

rejects((profile) => {
  profile.sandbox.components[1].pros = [];
}, /pros/);

rejects((profile) => {
  profile.schemaVersion = 2;
}, /schemaVersion/);

rejects((profile) => {
  profile.workloadChannels = [
    { id: "processing", kind: "async_work", ratePerSecond: 100, workUnitsPerOperation: 40 },
    { id: "processing", kind: "async_work", ratePerSecond: 100, workUnitsPerOperation: 40 },
  ];
}, /duplicate workload channel/i);

rejects((profile) => {
  profile.workloadChannels = [{ id: "processing", kind: "async_work", ratePerSecond: 0, workUnitsPerOperation: 40 }];
}, /ratePerSecond/i);

rejects((profile) => {
  profile.volumeProfile = {
    bands: [{ mechanismId: "async_buffer", baselineShareOfChannel: { min: 0, max: 1 } }],
    rules: profile.volumeProfile.rules,
  };
}, /channelId/i);

rejects((profile) => {
  profile.starterArchitecture = { version: 1, components: "nope", connections: [] };
}, /starterArchitecture/i);

console.log("verify-level-profile-schema: ok");
