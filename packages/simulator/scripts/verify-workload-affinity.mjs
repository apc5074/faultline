import assert from "node:assert/strict";
import { tinyApiChallenge } from "@faultline/challenges";
import {
  effectiveEffectiveness,
  mechanismIdForCatalogType,
  resolveMechanismAffinity,
  resolveNodeRole,
  roleMultiplier,
} from "../dist/index.js";

function component(id, type, extra = {}) {
  return { id, type, config: {}, deployments: [], ui: { x: 0, y: 0 }, ...extra };
}

function edge(id, sourceComponentId, targetComponentId, type) {
  return { id, sourceComponentId, sourcePortId: "out", targetComponentId, targetPortId: "in", type };
}

// --- mechanismIdForCatalogType ---------------------------------------------------------------

assert.equal(mechanismIdForCatalogType("cdn"), "edge_cache");
assert.equal(mechanismIdForCatalogType("redis"), "data_cache");
assert.equal(mechanismIdForCatalogType("load-balancer"), "request_fanout");
assert.equal(mechanismIdForCatalogType("global-router"), "geo_routing");
assert.equal(mechanismIdForCatalogType("service"), "stateless_compute");
assert.equal(mechanismIdForCatalogType("postgres"), "durable_store");
assert.equal(mechanismIdForCatalogType("traffic-source"), null);
assert.equal(mechanismIdForCatalogType("made-up-type"), null);

// --- resolveNodeRole: Redis --------------------------------------------------------------------

{
  // read-aside: traffic -> service -> redis -> postgres
  const architecture = {
    version: 1,
    components: [component("t1", "traffic-source"), component("svc1", "service"), component("redis1", "redis"), component("pg1", "postgres")],
    connections: [
      edge("e1", "t1", "svc1", "request"),
      edge("e2", "svc1", "redis1", "read_write"),
      edge("e3", "redis1", "pg1", "read_write"),
    ],
  };
  assert.equal(resolveNodeRole(architecture, "redis1"), "read_aside");
  assert.equal(resolveNodeRole(architecture, "pg1"), "primary_store");
  assert.equal(resolveNodeRole(architecture, "svc1"), "compute");
}

{
  // dangling: zero edges at all
  const architecture = {
    version: 1,
    components: [component("t1", "traffic-source"), component("svc1", "service"), component("redis1", "redis")],
    connections: [edge("e1", "t1", "svc1", "request")],
  };
  assert.equal(resolveNodeRole(architecture, "redis1"), "unreachable");
}

{
  // "Users -> Redis" edge: traffic source wired directly onto redis's data port, no service.
  // No traffic actually reaches it in the propagation model (only services/caches originate
  // read_write flow), so this resolves unreachable, not misplaced.
  const architecture = {
    version: 1,
    components: [component("t1", "traffic-source"), component("redis1", "redis")],
    connections: [edge("e1", "t1", "redis1", "read_write")],
  };
  assert.equal(resolveNodeRole(architecture, "redis1"), "unreachable");
}

{
  // reachable from compute, but no downstream store: "only on write path / no DB neighbor"
  const architecture = {
    version: 1,
    components: [component("t1", "traffic-source"), component("svc1", "service"), component("redis1", "redis")],
    connections: [edge("e1", "t1", "svc1", "request"), edge("e2", "svc1", "redis1", "read_write")],
  };
  assert.equal(resolveNodeRole(architecture, "redis1"), "misplaced");
}

// --- resolveNodeRole: CDN ------------------------------------------------------------------------

{
  const onPath = {
    version: 1,
    components: [component("t1", "traffic-source"), component("cdn1", "cdn"), component("svc1", "service")],
    connections: [edge("e1", "t1", "cdn1", "request"), edge("e2", "cdn1", "svc1", "request")],
  };
  assert.equal(resolveNodeRole(onPath, "cdn1"), "edge_ingress");

  const offPath = {
    version: 1,
    components: [component("t1", "traffic-source"), component("cdn1", "cdn"), component("svc1", "service")],
    connections: [edge("e1", "t1", "svc1", "request")],
  };
  assert.equal(resolveNodeRole(offPath, "cdn1"), "unreachable");
}

// --- resolveNodeRole: Load balancer (role stable across upstream count) -------------------------

{
  const oneUpstream = {
    version: 1,
    components: [component("t1", "traffic-source"), component("lb1", "load-balancer"), component("svc1", "service")],
    connections: [edge("e1", "t1", "lb1", "request"), edge("e2", "lb1", "svc1", "request")],
  };
  const manyUpstreams = {
    version: 1,
    components: [
      component("t1", "traffic-source"),
      component("lb1", "load-balancer"),
      component("svc1", "service"),
      component("svc2", "service"),
      component("svc3", "service"),
    ],
    connections: [
      edge("e1", "t1", "lb1", "request"),
      edge("e2", "lb1", "svc1", "request"),
      edge("e3", "lb1", "svc2", "request"),
      edge("e4", "lb1", "svc3", "request"),
    ],
  };
  assert.equal(resolveNodeRole(oneUpstream, "lb1"), "path_middleware");
  assert.equal(resolveNodeRole(manyUpstreams, "lb1"), "path_middleware");
}

// --- resolveNodeRole: unreachable node --------------------------------------------------------

{
  const architecture = {
    version: 1,
    components: [component("t1", "traffic-source"), component("svc1", "service"), component("svc-isolated", "service")],
    connections: [edge("e1", "t1", "svc1", "request")],
  };
  assert.equal(resolveNodeRole(architecture, "svc-isolated"), "unreachable");
}

// --- resolveNodeRole: global router geo context -----------------------------------------------

{
  const architecture = {
    version: 1,
    components: [component("t1", "traffic-source"), component("router1", "global-router"), component("svc1", "service")],
    connections: [edge("e1", "t1", "router1", "request"), edge("e2", "router1", "svc1", "request")],
  };
  assert.equal(resolveNodeRole(architecture, "router1"), "path_middleware");
  assert.equal(resolveNodeRole(architecture, "router1", { geographicRoutingActive: true }), "geo_route");
}

// --- resolveMechanismAffinity / roleMultiplier / effectiveEffectiveness -------------------------

// Missing challenge affinity: ceiling 1.0, role multiplier 1.0 for a role with no built-in default.
{
  assert.equal(tinyApiChallenge.workloadAffinity, undefined);
  const affinity = resolveMechanismAffinity(tinyApiChallenge, "data_cache");
  assert.equal(affinity.maxEffectiveness, 1);
  assert.equal(roleMultiplier(affinity, "read_aside"), 1);
  assert.equal(roleMultiplier(affinity, "unreachable"), 0);
  assert.equal(roleMultiplier(affinity, "misplaced"), 0.05);
}

// ceiling 0.3 x read_aside(1.0) x intent 0.8 -> 0.24
{
  const challenge = {
    ...tinyApiChallenge,
    workloadAffinity: { mechanisms: { data_cache: { maxEffectiveness: 0.3, byRole: { read_aside: 1.0 } } } },
  };
  const architecture = {
    version: 1,
    components: [component("t1", "traffic-source"), component("svc1", "service"), component("redis1", "redis"), component("pg1", "postgres")],
    connections: [
      edge("e1", "t1", "svc1", "request"),
      edge("e2", "svc1", "redis1", "read_write"),
      edge("e3", "redis1", "pg1", "read_write"),
    ],
  };
  const result = effectiveEffectiveness({
    challenge,
    catalogType: "redis",
    nodeId: "redis1",
    architecture,
    playerIntent: 0.8,
  });
  assert.equal(result.mechanismId, "data_cache");
  assert.equal(result.role, "read_aside");
  assert.ok(Math.abs(result.challengeCeiling - 0.3) < 1e-9);
  assert.ok(Math.abs(result.effective - 0.24) < 1e-9);
}

// Same Redis config, read_aside vs misplaced -> different effective.
{
  const challenge = {
    ...tinyApiChallenge,
    workloadAffinity: {
      mechanisms: { data_cache: { maxEffectiveness: 0.3, byRole: { read_aside: 1.0 }, defaultRoleMultiplier: 0.1 } },
    },
  };
  const readAsideArchitecture = {
    version: 1,
    components: [component("t1", "traffic-source"), component("svc1", "service"), component("redis1", "redis"), component("pg1", "postgres")],
    connections: [
      edge("e1", "t1", "svc1", "request"),
      edge("e2", "svc1", "redis1", "read_write"),
      edge("e3", "redis1", "pg1", "read_write"),
    ],
  };
  const misplacedArchitecture = {
    version: 1,
    components: [component("t1", "traffic-source"), component("svc1", "service"), component("redis1", "redis")],
    connections: [edge("e1", "t1", "svc1", "request"), edge("e2", "svc1", "redis1", "read_write")],
  };
  const readAside = effectiveEffectiveness({ challenge, catalogType: "redis", nodeId: "redis1", architecture: readAsideArchitecture, playerIntent: 0.8 });
  const misplaced = effectiveEffectiveness({ challenge, catalogType: "redis", nodeId: "redis1", architecture: misplacedArchitecture, playerIntent: 0.8 });
  assert.equal(readAside.role, "read_aside");
  assert.equal(misplaced.role, "misplaced");
  assert.notEqual(readAside.effective, misplaced.effective);
  assert.ok(readAside.effective > misplaced.effective);
}

// Unknown catalog type -> null mechanism, intent passes through unscored.
{
  const architecture = { version: 1, components: [component("weird1", "made-up-type")], connections: [] };
  const result = effectiveEffectiveness({
    challenge: tinyApiChallenge,
    catalogType: "made-up-type",
    nodeId: "weird1",
    architecture,
    playerIntent: 0.42,
  });
  assert.equal(result.mechanismId, null);
  assert.equal(result.role, null);
  assert.equal(result.challengeCeiling, null);
  assert.equal(result.effective, 0.42);
}

console.log("workload affinity helpers verified");
