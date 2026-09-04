# Agent capabilities package guide

`@faultline/agent-capabilities` owns adapter-neutral agent behavior. It accepts
an immutable `AgentContext` plus validated input and returns bounded,
simulator-grounded evidence, a presentation intent, or a temporary simulated
experiment result. It must not own React state, WebMCP registration, model
prompts, persistence, or a second implementation of architecture/simulator
semantics.

Start with the root [`AGENTS.md`](../../AGENTS.md), then
[`docs/AGENT_CAPABILITIES.md`](../../docs/AGENT_CAPABILITIES.md). This file is
the local implementation guide; source and the package verifiers decide the
current contract.

## Ownership boundary

```text
current Architecture + Challenge + simulator evidence
                    │
                    ▼
              AgentContext (immutable)
                    │
        registry validates and invokes
          ┌─────────┼──────────┐
          ▼         ▼          ▼
        read      visual    experiment
       evidence    intent    simulated result
          │         │          │
          └────── adapter/host applies or presents ────┘
```

The package consumes canonical types from `@faultline/core`, catalog facts, and
simulator-produced evidence. It never changes the canonical architecture,
recomputes cost/capacity/requirements, persists an experiment, or decides an
official result.

## Public contracts

| Need | Start with | Rule |
| --- | --- | --- |
| Capability shape and shared input schema | `capability.ts` | Every capability has a name, schema, mode, availability predicate, executor, and optional annotations/exposure. |
| Invocation, input validation, cancellation, consent | `registry.ts` | Invoke through `AgentCapabilityRegistry`; do not call an executor with unvalidated external input. |
| Current snapshot/evidence provenance | `context.ts` | Treat `AgentContext` and its evidence as immutable for one invocation. |
| Controlled outcomes | `result.ts`, `evidence-result.ts` | Return `CapabilityResult`; do not throw user-facing/domain failures. |
| Default registration | `capabilities/index.ts` | Register a behavior once in `createDefaultCapabilityRegistry`. Duplicate names throw. |
| Read/visual/experiment surface resolution | `resolve-*.ts`, `capability-names.ts` | Resolve from the current context; registration does not imply exposure. |
| Browser presentation/session helpers | `session.ts`, `visual-executors.ts` | Return validated intents; the host applies them to session state. |

`AgentCapability.inputSchema` is the shared adapter contract: its JSON Schema
subset describes host input and `safeParse` is the execution boundary. Keep the
two aligned. Do not recreate capability validation independently in WebMCP or
an AI SDK adapter.

## Evidence and freshness

- `AgentContext.architecture` and `.challenge` are the canonical input for an
  invocation. `simulation`, `cost`, and requirement results may be absent; a
  capability must represent unavailable evidence rather than invent values.
- `EvidenceMeta` records semantic architecture revision, simulation run ID,
  simulator version, staleness, and generation time. Hosts need fresh context
  for assertions about the current board; prior chat, selection, annotations,
  and old results are not evidence.
- `architectureEvidenceFingerprint` deliberately excludes `Architecture.ui`.
  It is the semantic revision used for evidence freshness and live experiment
  consent. Do not add presentation fields to it.
- `comparisonSnapshotFromContext` is the narrow retained-comparison boundary.
  Preserve its exclusion of UI and avoid retaining arbitrary full contexts for
  cross-revision or cross-player comparison.
- Capabilities project simulator facts. They must not introduce independent
  formulas for capacity, cost, path validity, requirement pass/fail, or
  workload placement.

## Modes and non-negotiable safety

| Mode | Allowed output | Prohibited behavior |
| --- | --- | --- |
| `read` | Current architecture, challenge, simulator, or derived review evidence. | Architecture edits, session mutation, official writes, or invented metrics. |
| `visual` | Validated focus/annotation/connection/region/observation intent. | Treating a visual mark as simulator truth or editing architecture. |
| `experiment` | Temporary baseline/outcome/delta/event evidence. | Persisting an overlay or mutating architecture, challenge, catalog, official attempts, or leaderboard data. |

The registry returns controlled `CapabilityResult` errors: `NOT_FOUND`,
`SIMULATION_UNAVAILABLE`, `INVALID_INPUT`, `CONSENT_REQUIRED`, or `CANCELLED`.
Unexpected executor errors become `INVALID_INPUT` without a stack trace.

For a live invocation (one that supplies `options.session`), an experiment
needs page-owned consent for the exact capability. The consent is bound to the
semantic architecture fingerprint, expires after five minutes, and cannot be
created by a tool call. Successful live experiment results are only cached for
the exact capability, semantic architecture, input, and consent window.

## Capability surfaces

There are intentionally several views of the registry:

| Surface | Resolver / source | Composition |
| --- | --- | --- |
| Default registry | `createDefaultCapabilityRegistry` | All registered shared capabilities, including helpers not exposed to every host. |
| General read surface | `resolveCapabilities` | Baseline reads, then conditional Phase 7 specialists. |
| Visual coaching surface | `resolveVisualCapabilities` | Baseline visual capabilities only. |
| Experiment surface | `resolveExperimentCapabilities` | Production experiment names with `mode: "experiment"` and current availability. |
| WebMCP production profile | `PRODUCTION_CAPABILITY_MANIFEST` | Intentional subset grouped as `stable-review`, `specialists`, `stable-visual`, or `experiments`. |

Read and visual resolvers are pure and deterministic. In development they
throw if required baseline registration is missing; production callers receive
the resolved capabilities plus structured skip reasons. The experiment resolver
is separate so a read-only host never gains an experiment merely by resolving
reads.

Dynamic specialists are architecture predicates, not prompt decisions:

- cache: a Redis component;
- replication: a Postgres replica configuration or deployment;
- regional traffic: valid deployment presence across at least two regions;
- Level 2 specialists: Queue, Worker, Object Storage, or CDN/Object Storage
  according to `phase7DynamicCapabilityPredicate`.

`focus_region` and `pin_observation` are in the shared visual baseline but are
not currently in the WebMCP production manifest. Likewise,
The `inspectBottlenecks` helper is used internally to build review packets; it
is not a separately registered or production-exposed capability. Do not expose
internal evidence helpers merely because their logic is useful to a review.

## Where to make a change

| Change | Start with | Then inspect |
| --- | --- | --- |
| A new semantic capability | `capabilities/<name>.ts`, `schemas.ts` | `capabilities/index.ts`, nearest verifier, resolver/manifest only if intended. |
| Input shape or output evidence | capability file + `schemas.ts`/`evidence-result.ts` | Output validator, WebMCP adaptation, affected tool-routing metadata. |
| Architecture-dependent availability | `architecture-predicates.ts` | `capability-names.ts`, availability fingerprint, resolver assertions. |
| Model-facing first-tool guidance | `tool-routing.ts` | Production manifest validation and targeted capability outputs. |
| Visual annotation/focus behavior | `visual-schemas.ts`, `visual-executors.ts`, `session.ts` | Browser bridge; preserve revision/target validation and annotation bounds. |
| Experiment semantics | capability file + core/simulator experiment types | `experiment-consent.ts`, readiness, simulator verifier, live-agent adapter. |
| Production exposure | `capability-names.ts` | `exposure` metadata, WebMCP registration/parity checks, routing guidance. |

## Adding or changing a capability

1. Choose `read`, `visual`, or `experiment`; visual output is never an
   architecture-edit backdoor.
2. Define a narrow shared schema with a matching `safeParse`, return a typed
   `CapabilityResult`, and use current `AgentContext` evidence.
3. Give the capability a pure `availableWhen` predicate. Add only predicate
   inputs to `architectureAvailabilityFingerprint`; evidence-only changes must
   not cause unnecessary surface re-registration.
4. Register it in `createDefaultCapabilityRegistry` and extend the narrowest
   verifier for success plus unavailable/invalid or stale boundary behavior.
5. Deliberately add it to a resolver and/or `PRODUCTION_CAPABILITY_MANIFEST`.
   Verify group, mode, annotations, routing, and adapter conversion instead of
   assuming registration exposes it.
6. For experiments, return a simulator-owned temporary result and retain exact,
   revision-bound human consent. For visual intents, validate target IDs and
   retain session pruning/bounds.

## Verification

For a semantic package change, run:

```sh
pnpm --filter @faultline/agent-capabilities verify
```

Use a nearby focused script first when appropriate. Current focused verifiers
cover review/compare evidence, schemas and cancellation, session behavior,
routing guardrails, individual read capabilities, resolver surfaces, visual
capabilities, every experiment class, Level 2 capabilities, evidence
continuations, and presentation cues. Read `package.json` to select the exact
command; add a focused verifier for a new regression-prone contract.

Then broaden according to the boundary crossed:

```sh
pnpm --filter @faultline/webmcp verify  # adapter conversion/surface parity
pnpm verify:agent-context               # web context and live-evidence integration
pnpm typecheck                          # public TypeScript contract changes
```

Before handoff, run `git diff --check` and inspect the diff. In particular,
check that a capability change did not accidentally expose a tool, allow an
agent to mutate canonical architecture, or turn stale/absent evidence into a
confident factual response.
