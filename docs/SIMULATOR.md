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

`latencyForUtilization` is the shared pure curve used by Service and Postgres. Each component supplies only a base latency (Service 20ms, Postgres 30ms). Pressure stays near base through 70% utilization, rises moderately through 90%, rises rapidly through 100%, and becomes obviously unacceptable above 100%. `evaluatePathLatency` applies that curve to service utilization and Postgres effective utilization, then reports Phase 1 request p95 as the worst Traffic→Service→Postgres path of `serviceLatency + databaseLatency`. Reads and writes share the database's effective pressure; geographic network latency is not modelled.

## Requirement evaluation

`evaluateRequirements` is configuration-driven and scores outcomes only. It derives throughput from the lowest handled-demand share across Services and Postgres, latency from path p95, headroom from the minimum of service headroom and `1 - postgresEffectiveUtilization`, and budget from `estimateMonthlyCost`. Each requirement returns actual, target, comparator, and a deterministic explanation; overall pass requires every requirement to pass. The run emits `requirement_passed` / `requirement_failed` events and never checks component names or prescribed topologies. Successful results also expose the Service and Postgres capacity metrics so the UI can render utilization and saturation state without recalculating thresholds.
