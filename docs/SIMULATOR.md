# Simulator

`packages/simulator` is the deterministic simulation source of truth, shared by browser and server. It must stay independent of React, the DOM, AI, and Supabase.

Simulation decides outcomes, including pass/fail; an LLM never does. Geography, cost, and emitted events are real simulation constraints, and UI animations will consume events rather than recreate simulation logic.

## Validation before simulation

`validateArchitectureForSimulation` is the shared entry boundary. It first validates canonical architecture shape, then checks registered component types/configuration, allowed challenge types, endpoint existence, self-connections, catalog port existence, semantic port compatibility, deployment consistency when present, and a viable request path from a Traffic Source. It returns structured errors for ordinary player mistakes and does not silently ignore invalid graph data.

## Traffic propagation

`propagateTraffic` validates first, then deterministically sorts IDs before routing workload. Challenge workload is divided across Traffic Sources and their actual `request` edges. Passthrough forwarders (Global Router, Load Balancer, CDN) move request traffic along `request` edges; CDN can absorb eligible redirect hits. Each Service forwards received volume across actual `read_write` database edges using the challenge read/write ratios. Redis can absorb eligible read hits before Postgres. The result reports component traffic, optional cache metrics, regional workload metadata, and `simulation_started` / `traffic_routed` / `simulation_finished` events. It does not calculate capacity, saturation, latency, or cost.

## Service capacity

`evaluateServiceCapacity` uses the Service definition's size × instances capacity model. Utilization is `incomingRps / capacityRps`; headroom is `(capacityRps - incomingRps) / capacityRps` and remains negative during overload to expose the shortfall. Its deterministic bands are healthy through 70%, warning through 90%, critical through 100%, and saturated above 100%. The result reports handled and unmet RPS and emits component load, warning, or saturation events.

## Postgres capacity

`evaluatePostgresCapacity` applies the Postgres tier's independent read and write capacities to the `readRps` and `writeRps` produced by `propagateTraffic`. Read capacity includes logical `readReplicaCount`; writes remain primary-only. It reports both utilization values, handled RPS, and capacity shortfalls. Effective database pressure is `max(readUtilization, writeUtilization)`, giving the latency model a single pressure value. A database is saturated when either utilization exceeds 1.

## Latency

`latencyForUtilization` is the shared pure curve used by Service and Postgres. Each component supplies only a base latency (Service 20ms, Postgres 30ms). Pressure stays near base through 70% utilization, rises moderately through 90%, rises rapidly through 100%, and becomes obviously unacceptable above 100%. `evaluatePathLatency` applies that curve to service utilization and Postgres effective utilization. In logical mode (no geographic routes), request p95 is the worst Traffic→Service→Postgres path of `serviceLatency + databaseLatency`. In geographic mode it builds per-origin redirect paths from `geographicRoutes`, adds matrix RTT once per remote hop, applies Redis hit rates so cache hits skip downstream DB network and processing, then reports a discrete traffic-weighted regional p95. Reads and writes share the database's effective pressure; the UI never recalculates latency.

## Geographic latency

`getRegionLatencyMs` is the centralized educational **round-trip (RTT)** latency matrix between the six Phase 3 regions. Each logical remote dependency call adds the matrix value once — do not double-count request and response separately. Same-region hops are a small nonzero cost (10ms). Cross-region values are fixed, symmetric, and deterministic — for example US East → Europe is 80ms and US East → Singapore is 220ms. These are simplified educational latency assumptions, not real provider SLAs. Unknown region IDs throw rather than returning undefined/NaN. UI must consume simulator results; it must not duplicate these constants.

## Geographic traffic distribution

`deriveRegionalWorkload` turns challenge `geographicDistribution` fractions into per-region `redirectRps`, `writeRps`, and `hotKeyRedirectRps`. Totals match global redirect/write demand; hot-key remains `redirect × hotKeyReadFraction` applied per origin. Writes inherit the same geographic fractions until a challenge supplies a separate write map. Challenges without distribution (Tiny API) produce an inactive regional workload. Successful traffic and requirements results expose `regionalWorkload` so UI can render traffic origins without recalculating percentages.

## Geographic routing

When challenge geography is active and at least one Service has regional deployments, `propagateTraffic` uses nearest-healthy-region selection (Global Router policy). For each traffic origin it finds services reachable over the logical request graph, ignores unhealthy regions, picks the lowest `getRegionLatencyMs` deployment, and breaks ties by `componentId` then `deploymentId`. Writes follow logical edges but always land on the Postgres primary deployment; reads prefer a same-region Redis deployment and same-region Postgres replica when present. Results expose `geographicRoutes` and `regionalTraffic` for visualization. Regional service overload uses per-deployment capacity so a hot nearest region can saturate even when total instances look fine. Logical-only architectures (no service deployments) keep Phase 1/2 forwarding.

## World map

The World view is a lightweight SVG map in `apps/web` driven by the same canonical `Architecture` and challenge geographic distribution. Region markers use `RegionRegistry` coordinates; traffic origin labels come from challenge fractions/RPS; deployment chips come from `ComponentInstance.deployments[]` (Service counts, Redis, Postgres primary vs replica). After a successful simulation, traffic arcs are drawn from `geographicRoutes` (aggregated by origin→destination→kind) with educational stroke weight for volume — never invented decorative paths. Animation is CSS-only; the simulator does not depend on it. The map does not own separate world domain state or call external map providers. Placement editing stays in the existing inspector.

## Phase 3 verification

`packages/simulator/scripts/verify-phase-3.mjs` (also `pnpm verify:phase-3`) is the small geography reality gate: one Architecture serialize round-trip, centralized US East placement (origins, cross-region latency + transfer), move capacity to Europe (route + network latency + cost change), Europe read replica (local reads, writes still to primary), plus Tiny API regression. It is not a large geography suite.

## Regional deployments

`ComponentInstance.deployments[]` places capacity for region-supporting components (Service, Redis, Postgres) without creating a second architecture model. Empty deployments keep logical-only Phase 1/2 behavior. When present, deployments are the physical capacity source: Service regional `instances` must sum to `config.instances`; Postgres requires exactly one `primary` and replica deployments must match `readReplicaCount`; Redis deployments are independent regional cache footprints (`mode: replicated` is local HA, not cross-region sync). Simulation validation rejects unknown regions, unsupported types, duplicate deployment IDs, and capacity mismatches.

## Requirement evaluation

`evaluateRequirements` is configuration-driven and scores outcomes only. It derives throughput from the lowest handled-demand share across Services and Postgres, latency from path p95, headroom from the minimum of service headroom and `1 - postgresEffectiveUtilization`, and budget from `estimateMonthlyCost` (component prices plus optional cross-region transfer/replication when `geographicRoutes` are present). Each requirement returns actual, target, comparator, and a deterministic explanation; overall pass requires every requirement to pass. The run emits `requirement_passed` / `requirement_failed` events and never checks component names or prescribed topologies. Successful results also expose the Service and Postgres capacity metrics so the UI can render utilization and saturation state without recalculating thresholds.

## Hot-key scenario

`evaluateHotKeyScenario` models concentrated viral-key redirect traffic when `challenge.workload.hotKeyReadFraction` is set. Viral RPS is `requestsPerSecond × readRatio × hotKeyReadFraction`, optionally scaled by challenge `workloadAffinity` cache `reuseConcentration` when authored (`data_cache` preferred, else `edge_cache`; default 1.0 preserves legacy load). That volume propagates through the real architecture (CDN → Service → Redis → Postgres) using the same request/`read_write` edges as aggregate traffic. CDN and Redis absorb viral volume through the same placement-aware configured hit rate as aggregate traffic (`resolveCacheConfiguredHitRate` in `workload-affinity.ts`); Redis saturation uses per-key `hotKeyCapacityRps` so aggregate cache utilization cannot hide a single-key bottleneck. Postgres hot-key pressure is measured against primary read capacity only—read replicas do not shard one viral key. When the fraction is omitted or zero (Tiny API), the scenario is inactive and does not affect pass/fail. When active, overall pass also requires the hot-key scenario to pass.

## Workload affinity

`packages/simulator/src/workload-affinity.ts` is the single source of truth for placement-aware scoring. It is pure and topology-only: no `challenge.slug` branches.

### Formula family

```text
mechanismFit     = challenge.workloadAffinity.mechanisms[mechanismId].maxEffectiveness   // 1.0 if omitted
placementFit     = byRole[role] ?? defaultRoleMultiplier ?? roleDefaults[role] ?? 1.0
playerIntent     = dial-derived (TTL/coverage/size/fan-out, …)
challengeCeiling = mechanismFit × placementFit
effective        = challengeCeiling × playerIntent     // only when ACTIVE; IDLE → 0 benefit
```

Caches apply `effective` as the configured hit rate before capacity caps (`resolveCacheConfiguredHitRate`). Non-cache ACTIVE capacity scales with `activeCapacityScale(placement)`. Missing affinity ⇒ mechanismFit `1.0` (legacy).

### Participation states

`resolveParticipationState(handledRps)` → `active` when `handledRps > 0`, else `idle`.

| State | Capacity / absorb | Usage-cost pressure | Latency penalty | Visuals |
| --- | --- | --- | --- | --- |
| ACTIVE | Scaled by `effective` | `unitCostPressure` when authored | `processingLatencyPenaltyMs` when authored | Busy path volumes |
| IDLE | No affinity benefit | Multiplier stays `1.0` (base catalog $ only) | None | Quiet / unused |

### Mechanism map (catalog → job)

| Catalog type | Mechanism |
| --- | --- |
| `cdn` | `edge_cache` |
| `redis` | `data_cache` |
| `load-balancer` | `request_fanout` |
| `global-router` | `geo_routing` |
| `service` | `stateless_compute` |
| `postgres` | `durable_store` |

Unmapped types (e.g. `traffic-source`) return `null` — no affinity scoring.

### Role predicates

`resolveNodeRole` derives roles from request / `read_write` reachability:

| Role | Typical meaning |
| --- | --- |
| `edge_ingress` | Reachable from traffic before compute on the request path |
| `path_middleware` | On request path between edge and compute |
| `compute` | Service that can handle requests |
| `read_aside` | Cache adjacent to a store on the service read path |
| `write_path` | Only on mutate/write edges |
| `geo_route` | Router when geographic routing is active |
| `primary_store` / `replica_store` | Durable store roles |
| `unreachable` | No traffic can reach the node |
| `misplaced` | Reachable but wiring does not match a productive pattern |

Defaults when `byRole` omits a role: mechanism `defaultRoleMultiplier`, else challenge `roleDefaults`, else `1.0`. Level 1 authors demote `unreachable` / `misplaced` / `write_path` via `roleDefaults`.

### Apply sites

| Site | Behavior |
| --- | --- |
| Cache absorb (`traffic.ts`, hot-key) | Placement-aware configured hit rate → hit/miss RPS and forwarded origin volume |
| Service / Postgres capacity | ACTIVE scale from placement evidence |
| Latency | Optional additive `processingLatencyPenaltyMs` on ACTIVE in-role work |
| Cost | `unitCostPressure` on usage-sensitive lines for ACTIVE handled work only |
| Events / volumes | `traffic_routed` and cache metrics carry affinity-scaled RPS that UI playback consumes |

Do not invent a second client-side “display hit rate” from challenge tables — canvas glyphs and edge particles render simulator volumes only.

### Hot-key interaction

Viral redirect RPS may be scaled by authored cache `reuseConcentration` (`data_cache` preferred, else `edge_cache`; default `1.0`). CDN/Redis still use the same placement-aware hit-rate path as aggregate traffic. Redis hot-key saturation uses per-key `hotKeyCapacityRps`.

### Traffic volume + event fields visuals consume

Presentation layers must consume complete simulator batches:

- `traffic_routed` — `requestsPerSecond` (and geographic origin when present) on connections/components
- Cache results — `hitRps`, `missRps`, `eligibleRps`, `downstreamAvoidedRps`, plus placement evidence (`role`, `mechanismId`, `challengeCeiling`, `playerIntent`, `effectiveConfiguredHitRate`)
- Service / Postgres metrics — utilization, handled/unmet RPS, optional `placement` (`participation`, `role`, `mechanismId`, `challengeCeiling`, `playerIntent`, `effective`, pressures)
- Hot-key scenario outcomes — pass/fail + path pressure facts

UI must never invent ambient traffic, random routing, or unmodeled resource meters.

**Level Profile volume bands** (`volumeProfile` in `*.level.json`) are curriculum/playtest guards only. They do not change simulator formulas. Canvas share visuals (`volume-share-visuals.ts`) map measured absorb / path RPS from this section into glyph and edge busyness; if a well-placed CDN still looks quieter than Redis, calibrate affinity ceilings — do not fake hit rates from profile bands.

## Simulator version

`SIMULATOR_VERSION` in `@faultline/simulator` is recorded on each published `challenge_versions` row. Competition-affecting simulator changes require bumping this value and publishing a new challenge version so official attempts are never silently re-scored under incompatible semantics.

**v2** (with `url-shortener` challenge **v2**): workload affinity — placement-aware cache ceilings, non-cache capacity/latency/cost pressure, and hot-key `reuseConcentration`. Republish via `pnpm --filter @faultline/web seed:daily-challenge` after deploy when competition semantics change.

Competition note: bumping `SIMULATOR_VERSION` (or challenge `version`) without republishing leaves official attempts on the previous immutable `challenge_versions` row. Local play and official verify must agree on the same simulator + challenge pair (`docs/PRODUCTION.md`).
