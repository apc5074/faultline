# Simulator

`packages/simulator` is the deterministic simulation source of truth, shared by browser and server. It must stay independent of React, the DOM, AI, and Supabase.

Simulation decides outcomes, including pass/fail; an LLM never does. Geography, cost, and emitted events are real simulation constraints, and UI animations will consume events rather than recreate simulation logic.

## Validation before simulation

`validateArchitectureForSimulation` is the Phase 1 entry boundary. It first validates canonical architecture shape, then checks registered component types/configuration, allowed challenge types, endpoint existence, self-connections, catalog port existence, semantic port compatibility, and a viable request path from a Traffic Source. It returns structured errors for ordinary player mistakes and does not silently ignore invalid graph data. Traffic propagation and performance calculations arrive in later simulator tickets.

## Traffic propagation

`propagateTraffic` validates first, then deterministically sorts IDs before routing workload. Tiny API workload is divided across Traffic Sources and their actual `request` edges. Each Service forwards its received request volume across actual `read_write` database edges using the challenge read/write ratios. The result reports component traffic and initial `simulation_started`, `traffic_routed`, and `simulation_finished` events. It does not calculate capacity, saturation, latency, or cost.

## Service capacity

`evaluateServiceCapacity` uses the Service definition's central capacity-per-instance value. Utilization is `incomingRps / capacityRps`; headroom is `(capacityRps - incomingRps) / capacityRps` and remains negative during overload to expose the shortfall. Its deterministic bands are healthy through 70%, warning through 90%, critical through 100%, and saturated above 100%. The result reports handled and unmet RPS and emits component load, warning, or saturation events. Latency calculations remain a later ticket.

## Postgres capacity

`evaluatePostgresCapacity` applies the Postgres tier's independent read and write capacities to the `readRps` and `writeRps` produced by `propagateTraffic`. It reports both utilization values, handled RPS, and capacity shortfalls. Effective database pressure is `max(readUtilization, writeUtilization)`; this Phase 1 simplification gives one deterministic state and later latency model a single pressure value without combining unlike operations. A database is saturated when either utilization exceeds 1. No replica or other read-scaling logic exists in this phase.
