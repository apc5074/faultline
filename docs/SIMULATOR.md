# Simulator

`packages/simulator` is the deterministic simulation source of truth, shared by browser and server. It must stay independent of React, the DOM, AI, and Supabase.

Simulation decides outcomes, including pass/fail; an LLM never does. Geography, cost, and emitted events are real simulation constraints, and UI animations will consume events rather than recreate simulation logic.

## Validation before simulation

`validateArchitectureForSimulation` is the Phase 1 entry boundary. It first validates canonical architecture shape, then checks registered component types/configuration, allowed challenge types, endpoint existence, self-connections, catalog port existence, semantic port compatibility, and a viable request path from a Traffic Source. It returns structured errors for ordinary player mistakes and does not silently ignore invalid graph data. Traffic propagation and performance calculations arrive in later simulator tickets.

## Traffic propagation

`propagateTraffic` validates first, then deterministically sorts IDs before routing workload. Tiny API workload is divided across Traffic Sources and their actual `request` edges. Each Service forwards its received request volume across actual `read_write` database edges using the challenge read/write ratios. The result reports component traffic and initial `simulation_started`, `traffic_routed`, and `simulation_finished` events. It does not calculate capacity, saturation, latency, or cost.

## Service capacity

`evaluateServiceCapacity` uses the Service definition's central capacity-per-instance value. Utilization is `incomingRps / capacityRps`; headroom is `(capacityRps - incomingRps) / capacityRps` and remains negative during overload to expose the shortfall. Its deterministic bands are healthy through 70%, warning through 90%, critical through 100%, and saturated above 100%. The result reports handled and unmet RPS and emits component load, warning, or saturation events.

## Postgres capacity

`evaluatePostgresCapacity` applies the Postgres tier's independent read and write capacities to the `readRps` and `writeRps` produced by `propagateTraffic`. It reports both utilization values, handled RPS, and capacity shortfalls. Effective database pressure is `max(readUtilization, writeUtilization)`; this Phase 1 simplification gives one deterministic state and the latency model a single pressure value without combining unlike operations. A database is saturated when either utilization exceeds 1. No replica or other read-scaling logic exists in this phase.

## Latency

`latencyForUtilization` is the shared pure curve used by Service and Postgres. Each component supplies only a base latency (Service 20ms, Postgres 30ms). Pressure stays near base through 70% utilization, rises moderately through 90%, rises rapidly through 100%, and becomes obviously unacceptable above 100%. `evaluatePathLatency` applies that curve to service utilization and Postgres effective utilization, then reports Phase 1 request p95 as the worst Traffic→Service→Postgres path of `serviceLatency + databaseLatency`. Reads and writes share the database's effective pressure; geographic network latency is not modelled in that path evaluator yet.

## Geographic latency

`getRegionLatencyMs` is the centralized educational latency matrix between the six Phase 3 regions. Same-region hops are a small nonzero cost (10ms). Cross-region values are fixed, symmetric, and deterministic — for example US East → Europe is 80ms and US East → Singapore is 220ms. These are simplified educational latency assumptions, not real provider SLAs. Unknown region IDs throw rather than returning undefined/NaN. UI must consume simulator results; it must not duplicate these constants.

## Geographic traffic distribution

`deriveRegionalWorkload` turns challenge `geographicDistribution` fractions into per-region `redirectRps`, `writeRps`, and `hotKeyRedirectRps`. Totals match global redirect/write demand; hot-key remains `redirect × hotKeyReadFraction` applied per origin. Writes inherit the same geographic fractions until a challenge supplies a separate write map. Challenges without distribution (Tiny API) produce an inactive regional workload. Successful traffic and requirements results expose `regionalWorkload` so UI can render traffic origins without recalculating percentages.

## Requirement evaluation

`evaluateRequirements` is configuration-driven and scores outcomes only. It derives throughput from the lowest handled-demand share across Services and Postgres, latency from path p95, headroom from the minimum of service headroom and `1 - postgresEffectiveUtilization`, and budget from `estimateMonthlyCost`. Each requirement returns actual, target, comparator, and a deterministic explanation; overall pass requires every requirement to pass. The run emits `requirement_passed` / `requirement_failed` events and never checks component names or prescribed topologies. Successful results also expose the Service and Postgres capacity metrics so the UI can render utilization and saturation state without recalculating thresholds.

## Hot-key scenario

`evaluateHotKeyScenario` models concentrated viral-key redirect traffic when `challenge.workload.hotKeyReadFraction` is set. Viral RPS is `requestsPerSecond × readRatio × hotKeyReadFraction`. That volume propagates through the real architecture (CDN → Service → Redis → Postgres) using the same request/`read_write` edges as aggregate traffic. CDN and Redis absorb viral volume through shared `evaluateCacheOffload` hit/capacity rules; Redis saturation uses per-key `hotKeyCapacityRps` so aggregate cache utilization cannot hide a single-key bottleneck. Postgres hot-key pressure is measured against primary read capacity only—read replicas do not shard one viral key. When the fraction is omitted or zero (Tiny API), the scenario is inactive and does not affect pass/fail. When active, overall pass also requires the hot-key scenario to pass.
