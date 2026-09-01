# Simulator package guide

`@faultline/simulator` owns deterministic evaluation truth. It accepts canonical
architecture, a challenge definition, the component registry, and optionally a
temporary experiment overlay; it produces validation errors or simulator-owned
evidence. It must remain independent of React, browser APIs, Supabase, agent
hosts, network calls, and wall-clock state.

Start with the root [`AGENTS.md`](../../AGENTS.md) and
[`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md). This guide is specific to
the current package implementation.

## Public evaluation paths

| Need | Entry point | Output ownership |
| --- | --- | --- |
| Validate architecture for a challenge | `validateArchitectureForSimulation` | Simulation-boundary validation errors. |
| Propagate traffic and emit path/cache/geo evidence | `propagateTraffic` | Traffic, caches, regional data, routes, events, workload paths, and optional multi-workload evidence. |
| Evaluate player-facing outcomes | `evaluateRequirements` | Requirements, aggregate metrics, cost, service/Postgres metrics, events, and hot-key result. |
| Estimate cost from canonical inputs | `estimateMonthlyCost` | Shared `CostResult`; callers must not reconstruct pricing. |
| Evaluate a temporary scenario | `evaluateExperiment` | Baseline/outcome/delta/events marked simulated and non-persistent. |

`evaluateRequirements` is the normal complete evaluation entry point. It
composes path latency/capacity evidence, hot-key evaluation, cost, and
challenge-owned requirement evaluation. Do not introduce a competing
pass/fail calculation in an adapter or UI.

## Implemented evaluation order

```text
structural architecture parse
  → simulator validation (catalog, challenge allowance, ports, deployments)
  → traffic propagation (logical or geographic routing)
  → workload-path and optional multi-workload evidence
  → service/Postgres capacity and latency
  → hot-key scenario
  → cost (components, usage, transfer, optional multi-workload inputs)
  → challenge requirement results + ordered events
```

An invalid input returns structured validation errors; it must never return
invented zero metrics as though it were a successful run. A valid result's
events and evidence are authoritative presentation inputs.

## Invariants

- Use `validateArchitectureForSimulation` before calculations that require
  registered component types, valid config, compatible ports, permitted
  components, a request path, regions, or deployment constraints.
- `Architecture.ui` is not simulation input. Presentation state, agent
  annotations, selection, view mode, and browser-local metadata must not affect
  a result.
- Challenges supply workload, requirements, affinity, geographic distribution,
  transfer assumptions, and completion contracts. Never branch simulator
  semantics on a challenge slug or prescribe a topology.
- The component catalog supplies config schemas, ports, capacity/cost models,
  and component metadata. Do not hard-code a second catalog in this package.
- Use stable ordering for components, connections, routes, paths, line items,
  and events. Do not introduce randomness, wall-clock inputs, or raw iteration
  order as tie-breakers; follow the existing ID-sorted conventions and use
  explicit locale formatting for user-facing numeric text.
- Geography is simulated only when the challenge has geographic workload and
  the architecture has Service deployments. In geographic mode, retain
  simulator-owned regional traffic and route evidence; do not copy latency or
  routing rules to UI code.
- Workload completion is resolved from challenge contracts plus the graph and
  catalog roles. A locally loaded component on an incomplete path is not proof
  of completed demand.
- Experiments use `ExperimentOverlay` and immutable challenge copies. Never
  mutate the caller's Architecture, ChallengeDefinition, or catalog config.

## Change routing

| Change | Start with | Also inspect |
| --- | --- | --- |
| Input validity, catalog allowance, ports, or deployments | `validation.ts`, `deployments.ts` | Core architecture and catalog schemas. |
| Request/data flow, caches, events, or geographic routes | `traffic.ts`, `cache.ts`, `geographic-routing.ts` | Capacity, latency, and playback consumers. |
| Service/Postgres capacity or state bands | `service-capacity.ts`, `postgres-capacity.ts` | Requirements, latency, hot-key behavior. |
| Latency or geographic latency | `latency.ts`, `region-latency.ts` | Traffic route evidence and requirement checks. |
| Cost or transfer | `cost.ts`, `transfer-cost.ts` | Catalog pricing and official submission. |
| Viral-key semantics | `hot-key.ts` | Cache traffic, Postgres capacity, requirements. |
| Placement-aware behavior | `workload-affinity.ts` | Catalog mechanism mapping, traffic/events, cost, agent evidence. |
| Completion/async workload semantics | `workload-paths.ts`, `workload-flow.ts`, `level2.ts` | Challenge contracts and requirement aggregation. |
| Temporary scenarios | `experiment.ts` | Core experiment validation and interview scenario evaluation. |

## Output compatibility

Simulator result shapes are consumed by web playback/canvas/map code, agent
context construction, server-side official verification, and verification
scripts. When adding or changing a result field:

1. Make it deterministic and define its absence on invalid/inapplicable input.
2. Add it at the public result type/export boundary.
3. Update every affected consumer as a consumer of simulator evidence; do not
   let a consumer infer or recompute the field.
4. Add focused assertions for both the new behavior and a nearby boundary case.

`SIMULATOR_VERSION` is competition-affecting. Bump it when a change alters
pass/fail, metrics, or cost semantics that invalidate published official
snapshots. Review challenge publishing and server verification in the same
change; a type-only change does not automatically require a version bump.

## Verification

Use a focused verifier while iterating, then run the package suite for any
semantic change:

```sh
pnpm --filter @faultline/simulator verify
```

Focused package commands include:

```sh
pnpm --filter @faultline/simulator verify:level1-component-composition
pnpm --filter @faultline/simulator verify:level1-logical-composition
pnpm --filter @faultline/simulator verify:level1-metrics-requirements
pnpm --filter @faultline/simulator verify:level1-geo-component-integration
pnpm --filter @faultline/simulator verify:level1-experiment-evidence
pnpm --filter @faultline/simulator verify:workload-flow
pnpm --filter @faultline/simulator verify:workload-paths
pnpm --filter @faultline/simulator verify:unconnected-paths
pnpm --filter @faultline/simulator verify:level2-workloads
```

The full suite also exercises validation, traffic, cost/transfer, capacity,
latency, deployments, geographic routing, caches/hot keys, experiments,
affinity, and component integrations. For cross-package affinity behavior use
the root `pnpm verify:affinity`; for public TypeScript contract changes run
`pnpm typecheck`.

Verification scripts are part of the contract. Extend the narrowest relevant
script instead of relying on snapshots of incidental complete result objects.
