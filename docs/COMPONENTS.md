# Components

`packages/component-catalog` owns component definitions and their simulation-facing metadata. New components register there because a level needs them, rather than through UI-specific behavior.

`ComponentRegistry` is the single registration boundary. It validates each definition, rejects duplicate stable types, resolves known definitions, and enumerates the registered catalog. A definition contains validated default configuration, domain port metadata, declared metrics, optional simulation/cost metadata, and explicit future-support flags. It must not contain challenge workload.

## Product rule

Difficulty comes from levels. Components are a controlled sandbox.

Player-facing knobs must be few, legible, and outcome-coupled. Creative freedom comes from topology plus sizing dials — not from exposing product-internals theater.

## Level 1 lever summary

| Component | Player levers | Notes |
|---|---|---|
| Traffic Source | challenge-owned | Not a sandbox toy |
| Stateless Service | `size`, `instances`, regional instances | Scale-up/out; deployments are capacity source when set |
| Postgres | `tier`, `readReplicas`, primary/replica regions | Reads scale independently of writes |
| Redis | `mode`, `tier`, `ttlBand`, regional placement | Standalone/replicated local HA; per-region caches |
| CDN | `coverage`, `ttlBand`, `tier` | Edge offload; writes always miss |
| Load Balancer | `policy` | `equal` or `capacity_weighted`; non-zero cost |
| Global Router | Phase 2 passthrough | Geographic/healthy routing in Phase 3 |

## Disruption readiness

Attack mode (cache flush, component failure, region failure) is implemented later. Level 1 components must still expose the levers players will use to respond: spare capacity, Redis replication, layered CDN, multi-service + LB, Postgres read scaling, and (in Phase 3) multi-region + Global Router.

Do not add an `HA: true` checkbox. Resilience must come from structure the simulator can evaluate.

## Current catalog notes

`postgres` is the Phase 1 database primitive extended in Phase 2 with `readReplicaCount` (0–8). Tier models keep primary read capacity, write capacity, per-replica read capacity, and educational costs together. Reads are split capacity-proportionally across primary + replicas; writes always hit the primary. Cost is primary tier + `readReplicaCount × monthlyCostPerReplica`. Missing `readReplicaCount` defaults to 0 for Tiny API compatibility. Phase 3 regional deployments assign exactly one primary region plus optional replica regions on the same component; when deployments are present, `readReplicaCount` must equal the replica deployment count.

`redis` is the Level 1 data-cache primitive. Player knobs are `mode` (`standalone` | `replicated`), `tier`, and `ttlBand`. Ports use `read_write` so `Service → Redis → Postgres` is a valid typed path. Replicated mode raises throughput/hot-key capacity and cost but does not cluster or shard a hot key. Regional Redis deployments are independent per-region cache footprints — replicated mode is local HA, not automatic cross-region sync. Redis must not absorb writes; hit/miss traffic reduction is applied by the simulator, not by the UI.

`global-router` is the Level 1 ingress router. Config stays empty (no weighted or active/passive knobs). When challenge geography and service deployments are active, it participates in nearest-healthy-region routing via the latency matrix on the same component type.

`load-balancer` distributes request traffic across Service components with `policy` `equal` or `capacity_weighted` and a non-zero educational monthly cost. Failure-aware exclusion of unhealthy backends is documented as a future extension and is not faked in Phase 2.

`cdn` is the Level 1 edge-cache primitive on the request path (`Traffic → CDN → Service`). Player knobs are `coverage` (0..1 logical eligibility), `ttlBand`, and `tier`. It reduces origin redirect traffic via simulator hit/miss offload; writes always miss. No geographic POPs in Phase 2.

## Workload affinity and dials

Player dials express **intent**; challenge × role ceilings cap how much of that intent applies when the instance is ACTIVE.

```text
playerIntent     ← catalog dials (TTL band, coverage, size, fan-out, …)
challengeCeiling ← maxEffectiveness × roleMultiplier   // challenge + graph role
effective        ← challengeCeiling × playerIntent     // simulator truth on ACTIVE work
```

Placement is **derived**, not authored per edge: `resolveNodeRole` in `@faultline/simulator`. Catalog type → mechanism ownership lives in `mechanismIdForCatalogType` (same module) — extend the map when adding a type; do not add challenge-slug branches or UI-only badges.

Affinity does not invent new knobs. It changes how much capacity, absorb, latency, and $ per unit work a mechanism delivers **when ACTIVE on a real path** for this workload. IDLE extras keep base catalog cost only. See `docs/CHALLENGES.md` (extending checklist) and `docs/SIMULATOR.md` (formula family).
