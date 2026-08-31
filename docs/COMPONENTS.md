# Component catalog contract

The component catalog is Faultline’s single registration boundary for placeable
infrastructure primitives. A catalog definition gives every consumer the same
type name, validated configuration, semantic ports, presentation metadata, and
declared capabilities. The catalog does not decide a challenge outcome: the
challenge selects permitted types and the simulator evaluates the resulting
architecture.

Current implementation:

- definitions: `packages/component-catalog/src/*.ts`;
- registry and definition validation: `packages/component-catalog/src/registry.ts`;
- default registered catalog: `packages/component-catalog/src/index.ts`;
- serializable component/connection contracts: `packages/core/src/component.ts`
  and `packages/core/src/architecture.ts`.

## Boundary and flow

```text
component definition ──register──> componentRegistry
        │                                │
        ├── config schema / ports ───────┼──> canvas edit validation
        ├── metadata / presentation ─────┼──> palette, glyphs, inspector, agents
        └── simulation / cost metadata ──┼──> simulator evaluation
                                         │
challenge.allowedComponentTypes ─────────┘──> level-specific sandbox
```

Do not add a component only in React, a challenge, an agent tool, or simulator
switch statement. Register it in the catalog, then make each downstream change
its declared semantics genuinely require.

## Canonical component instance

Every `Architecture` stores components in this serializable shape:

```ts
type ComponentInstance = {
  id: string;                 // stable; never derived from array position
  type: string;               // registered catalog type
  config: JsonObject;         // accepted by that type's configSchema
  deployments: RegionDeployment[];
  ui: { x: number; y: number }; // presentation only
};
```

`validateArchitecture` checks the generic JSON shape, IDs, and connection
envelope. It does not prove a type is registered, the configuration is valid
for that type, the component is allowed in the challenge, ports exist, or
deployments are meaningful. `validateArchitectureForSimulation` performs those
catalog/challenge/simulation checks before a run.

`ui` coordinates are required serialization data but must never affect
simulation, cost, requirements, agent evidence, or an official submission.

### Regional deployments

A `RegionDeployment` belongs to one logical component; it is not another
architecture model:

```ts
type RegionDeployment = { id: string; regionId: string; config: JsonObject };
```

`regionSupport` is catalog metadata that enables a component’s placement UI and
simulation validation. In the current catalog, Service, Postgres, and Redis
support deployments. Service deployment config uses `instances`; Postgres
deployment config uses `role: "primary" | "replica"`; Redis deployments model
independent regional cache footprints. The simulator owns the corresponding
capacity and topology constraints.

## Definition contract

`ComponentDefinition` includes the following required fields:

| Field | Consumer-facing meaning |
| --- | --- |
| `type`, `label`, `category` | Stable semantic identity and display grouping. Types must be lowercase hyphenated identifiers. |
| `defaultConfig`, `configSchema` | Default serializable config and its runtime `safeParse` boundary. The default must parse successfully. |
| `ports` | Stable port IDs, direction, and supported semantic connection types. |
| `metrics` | IDs/labels/units that describe possible evidence; the simulator determines whether it emits a value. |
| `presentation` | Framework-neutral glyph, size, config/deployment bindings, and supported visual states. |
| `simulation`, `cost` | Optional serializable metadata for shared deterministic consumers; not a substitute for simulator implementation. |
| capability flags | `regionSupport`, `replicationSupport`, `clusteringSupport`, and agent capability metadata. |
| `schemaVersion` | Positive integer for the component definition contract. |

The registry rejects duplicate types, invalid default configs, malformed or
duplicate port/metric IDs, invalid presentation descriptors, malformed agent
facts, non-serializable metadata, and invalid capability flags. It exposes
`get`, `has`, and `list`; an unknown lookup throws
`UnknownComponentTypeError`.

## Ports and connections

Connections are typed domain edges—not React Flow details:

```ts
type ConnectionType = "request" | "read_write" | "object_io" | "async_work";
```

`checkConnectionCompatibility` requires an output source port, input target
port, and a type supported by both ports. The canvas may call it for feedback;
the simulator remains the final validation boundary for an architecture.

The registered port shape is summarized below. `→` means an output port;
`←` means an input port.

| Type | Semantic ports |
| --- | --- |
| `traffic-source` | `request_out` → `request` |
| `global-router` | `request_in` ← `request`; `route_out` → `request` |
| `load-balancer` | `request_in` ← `request`; `request_out` → `request` |
| `cdn` | `request_in` ← `request`; `origin_out` → `request` |
| `service` | `request_in` ← `request`; `object_in` ← `object_io`; `database_out` → `read_write`; `object_out` → `object_io`; `async_out` → `async_work` |
| `redis` | `cache_in` ← `read_write`; `origin_out` → `read_write` |
| `postgres` | `database_in` ← `read_write` |
| `object-storage` | `object_in` ← `object_io`; `object_out` → `object_io` |
| `queue` | `queue_in` ← `async_work`; `queue_out` → `async_work` |
| `worker` | `queue_in` ← `async_work`; `object_in` ← `object_io`; `object_out` → `object_io` |

## Registered components

All ten definitions below are in `componentRegistry`. This is not a list of
components allowed in every level: each `ChallengeDefinition` supplies its own
`allowedComponentTypes` sandbox.

| Type | Category | Player configuration | Declared placement/support | Current modeled role |
| --- | --- | --- | --- | --- |
| `traffic-source` | Traffic | non-empty `label` | no regions/replication/clustering | Challenge-owned workload entry; no player capacity/cost dial. |
| `service` | Compute | `size`: small/medium/large; integer `instances` 1–10 | regions | Stateless request handler; can issue database, object, and async work. |
| `postgres` | Database | `tier`: small/medium/large; integer `readReplicaCount` 0–8 | regions; replication | Primary write/read capacity plus read-replica capacity. |
| `redis` | Cache | `mode`: standalone/replicated; `tier`: small/medium/large; `ttlBand`: short/medium/long | regions; replication | Data cache on a read/write path; cache/hot-key evidence is simulator-owned. |
| `global-router` | Networking | no knobs; routing policy is fixed | no regions/replication/clustering | Request forwarder for geographic routing; nearest healthy region policy. |
| `load-balancer` | Networking | `policy`: equal/capacity_weighted | no regions/replication/clustering | Logical request distribution across downstream services. |
| `cdn` | Cache | `coverage` 0–1; `ttlBand`: short/medium/long; `tier`: small/medium/large | no regions/replication/clustering | Request-path edge cache; reads may offload origin traffic, writes do not. |
| `object-storage` | Storage | `tier`: standard/high-throughput | no regions/replication/clustering | Large-object storage; upload and origin-read workload accounting is simulator-owned. |
| `queue` | Async | `capacityTier`: small/large | no regions/replication/clustering | Bounded async buffer; depth, age, overflow, and drain are simulator evidence. |
| `worker` | Async | `size`: standard/performance; integer `instances` 1–20 | no regions/replication/clustering | Async consumer; separate from synchronous Service capacity. |

Some schemas accept omitted fields for compatibility and apply their documented
defaults (for example Service size, Postgres replica count, Object Storage
tier, Queue tier, and Worker size). Do not depend on implicit defaults for new
persisted data: create components from `defaultConfig` and validate changes
through the registry schema.

## What the catalog does not promise

- A registered component is not automatically available in a challenge.
- A permitted component is not automatically connected, reachable, healthy, or
  useful for a workload.
- A metric definition does not guarantee a result field for every simulation.
- `agentCapabilities` metadata does not register an agent tool. Shared agent
  capability registration and availability remain in
  `@faultline/agent-capabilities`.
- Presentation metadata is not a simulation rule, and presentation state is
  not evidence.
- The educational tier/cost models are Faultline simulation inputs, not cloud
  provider pricing or deployment advice.

## Add or change a component safely

1. Add or update the definition in `packages/component-catalog/src`, with a
   narrow config schema, ports, metrics, presentation descriptor, support
   flags, and serializable metadata.
2. Register the definition in `componentRegistry`. Add tests to the catalog
   verifier for its default and contract shape.
3. Update simulator behavior only for real declared semantics: validation,
   traffic/path resolution, capacity/latency, cost, geography, workload flow,
   and experiments as applicable. Avoid challenge-slug branches.
4. Add the type to the intended Level Profile sandbox; do not broaden every
   challenge by default. Update level/profile validation and starter designs as
   appropriate.
5. Render it through existing catalog/glyph/inspector conventions. Preserve the
   same canonical architecture and port definitions in canvas and map views.
6. If it makes a specialist agent capability relevant, add that behavior in
   `@faultline/agent-capabilities` and expose it deliberately through its
   resolver/production manifest—not through catalog metadata alone.

Changing a config meaning, ports, cost model, or simulator behavior can change
official outcomes. Review `SIMULATOR_VERSION`, challenge publishing/snapshots,
server verification, agents, playback, and fixtures in the same change.

## Verification

For catalog-only contract changes:

```sh
pnpm --filter @faultline/component-catalog verify
pnpm typecheck
```

For behavior that reaches simulation or a Level Profile, also run the nearest
simulator and level checks, for example:

```sh
pnpm --filter @faultline/simulator verify
pnpm verify:level-profiles
pnpm --filter @faultline/web verify:component-vertical-slices
```

Finish by running `git diff --check` and inspecting the diff. A component is
complete only when its catalog contract, simulator semantics, level allowance,
and relevant presentation/agent consumers agree.
