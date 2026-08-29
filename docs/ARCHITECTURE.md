# Architecture

`apps/web` is the Next.js product surface. `packages/core` owns framework- and provider-independent contracts.

The browser canvas and world map must consume one canonical architecture state. The human owns architecture edits during a challenge; agents may inspect or challenge a design but do not edit it.

Supabase, Vercel, AI providers, and browser APIs are adapters around these boundaries, not sources of architecture truth. Persistence, canvas state, and adapter implementations are not yet built.

## Canonical architecture

`Architecture` in `@faultline/core` is the single serializable domain representation. It has an explicit `version`, stable component and connection IDs, component configuration, regional `deployments[]` on each component instance, and presentation-only `ui` coordinates. UI coordinates never belong to simulation input.

`RegionDeployment` carries a stable `id`, `regionId`, and component-specific `config` (service instances, Redis regional footprint, Postgres `primary`/`replica` role). Deployments are physical placement of the same logical component — never a second architecture model. Empty `deployments` keeps Phase 1/2 logical-only behavior. When deployments are present, they are the capacity source of truth and logical totals (`instances`, `readReplicaCount`) must match.

The Logical canvas and World SVG map are two presentation views of that same `Architecture`. View mode (`logical` | `world`) is React UI state only — it is never serialized into Architecture, never sent to `evaluateRequirements` / `propagateTraffic`, and never creates a second architecture store. Logical nodes may show a compact capacity summary (e.g. `9 instances · 3 regions`); World shows region markers, traffic origins, deployments, and simulated arcs. Both views share component IDs; the inspector edits regional placement for either view.

Use `validateArchitecture` or `parseArchitecture` when architecture-shaped data crosses an untrusted boundary. This first validation layer checks the serializable shape, version, identity uniqueness, and initial semantic connection fields. Simulation validation additionally rejects unknown regions, unsupported placement, capacity mismatches, and multiple Postgres primaries.

### Workload paths and completion

The canonical graph describes what is connected; a challenge-owned
`WorkloadCompletionContract` describes which connected stages are required for
each workload channel to complete. The simulator resolves both together before
applying capacity, latency, affinity, or cost projections. A component may have
local load while its branch is still incomplete: for example, a Service behind
a Load Balancer with no valid `read_write` path to Postgres or Redis can receive
requests but cannot complete redirects. Its traffic is explicit failure
evidence, not successful throughput.

Contracts may declare alternative terminals such as a CDN edge hit and an
origin response. Terminal branches are evaluated independently, so an edge-hit
path can complete without masking an origin-miss path that is missing a
dependency. This remains graph metadata, not a second architecture model or a
technology prescription.

## Typed connections

Phase 1 uses two semantic connection types: `request` for incoming traffic and `read_write` for a service's database traffic. `PortDefinition` describes a port's stable ID, direction, and supported semantic types. `checkConnectionCompatibility` is a pure core function: it permits only output-to-input pairs that both support the requested type. The component catalog will own the actual Traffic Source, Service, and Postgres port definitions; React Flow will later render handles from those definitions.
