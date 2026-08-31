# Canonical architecture contract

Faultline has one serializable architecture model: `Architecture` from
`@faultline/core`. The player edits it; the component catalog interprets its
types and ports; the simulator evaluates it; the web UI renders it; agent
contexts inspect it; and official submission verifies and persists it.

This document describes the contract implemented in `packages/core/src`. It
does not define traffic, capacity, latency, cost, or scoring formulas; those
belong to the simulator and challenge contracts.

## Architecture shape

```ts
Architecture = {
  version: 1;
  components: ComponentInstance[];
  connections: Connection[];
}

ComponentInstance = {
  id: string;
  type: string;
  config: JsonObject;
  deployments: RegionDeployment[];
  ui: { x: number; y: number };
}

Connection = {
  id: string;
  sourceComponentId: string;
  sourcePortId: string;
  targetComponentId: string;
  targetPortId: string;
  type: ConnectionType;
}
```

Component and connection IDs are stable, non-empty strings. They are identity,
not array positions: do not derive, replace, or persist them from indexes.
Component `config` and deployment `config` accept JSON-serializable values only.

`ui` is part of the serializable architecture shape because the canvas needs a
stable position. It is presentation-only: simulation, requirement evaluation,
cost, workload completion, official eligibility, and agent evidence must not
depend on it. Consumers that need a semantic comparison may intentionally omit
`ui`; that does not create another architecture model.

## Typed connections

The supported connection types are:

| Type | Used for |
| --- | --- |
| `request` | User-facing request flow. |
| `read_write` | Data reads and writes. |
| `object_io` | Object-storage data movement. |
| `async_work` | Buffered/async work flow. |

Connections point from a source component port to a target component port.
`checkConnectionCompatibility` is the domain-level compatibility check: the
source port must be an output, the target port an input, and both must permit
the connection type. Component definitions own the actual port lists in
`@faultline/component-catalog`; React Flow and other UI layers only render and
request these domain decisions.

## Regional deployments

`RegionDeployment` is physical placement of a component in the same canonical
architecture:

```ts
RegionDeployment = {
  id: string;
  regionId: string;
  config: JsonObject;
}
```

The region registry currently defines `us-east`, `us-west`, `europe`, `india`,
`singapore`, and `tokyo` in `packages/core/src/region.ts`. The architecture
schema accepts serializable deployment data; simulation validation determines
whether a region exists and whether the component supports deployment.

When deployments are present, simulator validation applies the implemented
component-specific rules:

- A Service has at most one deployment per region; every deployment supplies a
  positive integer `config.instances`; their sum equals logical
  `config.instances`.
- A Redis component has at most one deployment per region. Each deployment is
  an independent regional cache footprint.
- A Postgres component has exactly one `primary` deployment; its `replica`
  deployment count equals logical `config.readReplicaCount`.

Do not represent regional placement with a second graph, a copied architecture,
or UI-only state.

## Validation layers

Use the narrowest layer appropriate to the input. Passing an earlier layer does
not imply success at a later one.

| Layer | Entry point | Verifies | Does not decide |
| --- | --- | --- | --- |
| Structural schema | `validateArchitecture` / `parseArchitecture` in `@faultline/core` | Version, required serializable shape, finite UI coordinates, valid connection-type token, and unique component/connection IDs. | Registered component types, config schemas, ports, challenge allowance, region validity, deployment semantics, or viable request flow. |
| Simulation boundary | `validateArchitectureForSimulation` in `@faultline/simulator` | Catalog type/config, challenge allowlist, connection endpoints/ports/compatibility, Traffic Source/request path, supported regions, and deployment constraints. | Traffic/capacity/latency/cost outcomes. |
| Complete evaluation | `evaluateRequirements` in `@faultline/simulator` | Simulation validity plus propagated traffic, paths, capacity, latency, cost, and challenge requirements. | Client claims or an agent's independent judgment. |

At an untrusted boundary, accept `unknown` and use the validator result when
the caller needs structured errors; use `parseArchitecture` only where throwing
is the established boundary behavior. Do not cast browser/API/tool input to
`Architecture` and do not move simulation validation into the client.

## Workload completion is challenge-owned

The graph records what is connected. A challenge may supply a
`WorkloadCompletionContract` per workload channel to describe which graph roles
and typed transitions count as an end-to-end completed path.

The contract defines:

- accepted roles and behavior for abstract workload nodes;
- allowed typed transitions between those nodes;
- ingress roles; and
- terminal rules listing the nodes required for a response kind.

`resolveWorkloadPaths` combines that contract with the canonical graph and the
catalog's component roles. It emits deterministic complete/partial/failed path
evidence and identifies inactive components. It does not itself apply traffic
or resource capacity. The simulator applies those concerns later.

This separation keeps challenges topology-neutral: a challenge can define valid
completion semantics without encoding a canonical diagram or component-name
scoring requirement.

## Ownership and consumers

```text
core Architecture
  ├─ component catalog: type, config-schema, port, and region-support lookup
  ├─ simulator: validation, workload paths, traffic, metrics, cost, requirements
  ├─ web workspace: player editing and presentation
  ├─ agent context: fresh architecture-scoped evidence and validated visual references
  └─ official submission: server-side parse, simulation, canonical hash, persistence
```

Rules for changes:

- Change the shape, connection vocabulary, region identity, or shared helper in
  `packages/core`; export a public contract through its package barrel when a
  consumer needs it.
- Change a component's ports/config/region support in the component catalog,
  not in the architecture schema or UI.
- Change workload semantics in a challenge completion contract and the
  simulator's generic resolver—not with challenge-slug branches.
- Change truth calculations in the simulator. Web, agents, and persistence
  consume the result and must not recreate formulas.
- Use immutable experiment overlays for temporary failures/traffic changes;
  never write an experiment result back into canonical architecture.

## Persistence and official verification

Official submission accepts an architecture as untrusted input. The server
performs structural validation, evaluates it against a trusted challenge
snapshot with the shared component registry/simulator, and persists the
verified architecture plus a server-computed canonical SHA-256 hash. It never
trusts a client-supplied hash, metric, cost, pass/fail result, or solve time.

The persisted JSON remains an architecture record, not a substitute for a
challenge version or simulation result. Challenge snapshots and simulator
versions provide the context required to interpret an official result.

## Verification when changing this contract

- Core shape/connection changes: `pnpm --filter @faultline/core verify`
- Catalog or deployment interaction: `pnpm --filter @faultline/component-catalog verify`
  and `pnpm --filter @faultline/simulator verify`
- Workload completion behavior: the focused workload-path simulator verifier,
  then `pnpm --filter @faultline/simulator verify`
- Official serialization/verification impact: `pnpm --filter @faultline/web verify:submission`
- Cross-package public contract changes: `pnpm typecheck`

Before changing `Architecture.version`, find every parser, persisted record,
Level Profile starter, agent snapshot, and server submission consumer. A version
change is a compatibility change, not a local type edit.
