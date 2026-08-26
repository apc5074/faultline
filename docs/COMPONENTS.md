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
| Stateless Service | `size`, `instances` | Scale-up and scale-out |
| Postgres | `tier`, `readReplicas` | Reads scale independently of writes |
| Redis | `mode`, `tier`, `ttlBand` | Standalone/replicated; no clustering yet |
| CDN | `coverage`, `ttlBand`, `tier` | Edge offload; writes always miss |
| Load Balancer | `policy` | `equal` or `capacity_weighted`; non-zero cost |
| Global Router | Phase 2 passthrough | Geographic/healthy routing in Phase 3 |

## Disruption readiness

Attack mode (cache flush, component failure, region failure) is implemented later. Level 1 components must still expose the levers players will use to respond: spare capacity, Redis replication, layered CDN, multi-service + LB, Postgres read scaling, and (in Phase 3) multi-region + Global Router.

Do not add an `HA: true` checkbox. Resilience must come from structure the simulator can evaluate.

## Current catalog notes

`postgres` is the Phase 1 database primitive extended in Phase 2 with `readReplicaCount` (0–8). Tier models keep primary read capacity, write capacity, per-replica read capacity, and educational costs together. Reads are split capacity-proportionally across primary + replicas; writes always hit the primary. Cost is primary tier + `readReplicaCount × monthlyCostPerReplica`. Missing `readReplicaCount` defaults to 0 for Tiny API compatibility. Phase 3 may replace the count with region-assigned replica entries without changing the component type.

`redis` is the Level 1 data-cache primitive. Player knobs are `mode` (`standalone` | `replicated`), `tier`, and `ttlBand`. Ports use `read_write` so `Service → Redis → Postgres` is a valid typed path. Replicated mode raises throughput/hot-key capacity and cost but does not cluster or shard a hot key. Redis must not absorb writes; hit/miss traffic reduction is applied by the simulator (SIM-007), not by the UI.

`global-router` is a Phase 2 logical request passthrough (`request_in` → `route_out`) with zero cost. It forwards traffic without geographic selection. Phase 3 activates nearest healthy region routing on the same component type; Phase 2 config rejects premature geography knobs.

`load-balancer` distributes request traffic across Service components with `policy` `equal` or `capacity_weighted` and a non-zero educational monthly cost. Failure-aware exclusion of unhealthy backends is documented as a future extension and is not faked in Phase 2.

`cdn` is the Level 1 edge-cache primitive on the request path (`Traffic → CDN → Service`). Player knobs are `coverage` (0..1 logical eligibility), `ttlBand`, and `tier`. It reduces origin redirect traffic (SIM-007); writes always miss. No geographic POPs in Phase 2.
