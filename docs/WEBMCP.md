# WebMCP integration contract

Faultline exposes optional browser WebMCP tools through
`@faultline/webmcp`. This package is an adapter over the shared
`@faultline/agent-capabilities` registry: it does not implement a second
architecture model, simulator, cost model, capability schema, or eligibility
rule.

The current source of truth is:

- shared semantic capabilities: `packages/agent-capabilities/src`;
- browser adapter: `packages/webmcp/src`;
- Level 1 registration and current evidence: `apps/web/features/webmcp/` and
  `apps/web/features/agent-session/`;
- live context construction: `apps/web/lib/agent-context/create-agent-context.ts`.

## What is currently exposed

WebMCP is a progressive enhancement of the Level 1 canvas. It is enabled unless
`NEXT_PUBLIC_FAULTLINE_WEBMCP_ENABLED` is `false`, `0`, or `off`; it is also
unavailable when the browser does not expose `document.modelContext.registerTool`.
In either case, gameplay and local simulation continue without it.

The web app registers four independent production groups:

| Group | Purpose | Reconciles when |
| --- | --- | --- |
| `stable-review` | Core current-design reads. | Challenge identity changes or registration retry. |
| `stable-visual` | Persistent coaching marks/focus intents. | Challenge identity changes or registration retry. |
| `specialists` | Architecture-dependent read tools. | The challenge or architecture availability fingerprint changes. |
| `experiments` | Explicitly consented, temporary simulated scenarios. | The challenge or architecture availability fingerprint changes. |

The shared production manifest (`wmp-production-1`) presently permits:

```text
stable-review:
  review_current_design, expand_design_evidence, inspect_design_entity,
  inspect_component_option, compare_design_evidence, get_architecture,
  inspect_component, estimate_capacity, get_metrics, get_cost_breakdown

specialists:
  inspect_cache, inspect_replication, inspect_regional_traffic, inspect_queue,
  inspect_processing, inspect_object_storage, inspect_playback_origin

stable-visual:
  focus_component, annotate_component, highlight_connection, clear_annotations

experiments:
  run_load_test, change_traffic_pattern, flush_cache,
  inject_component_failure, inject_region_failure, slow_consumers
```

Registration is not exposure. A tool must be registered in the shared registry,
belong to the production manifest, have the required mode/safety annotations,
and be available for the current `AgentContext`. Specialist and experiment
availability is determined by shared architecture predicates and capability
logic, not by model choice or UI heuristics.

## Runtime flow

```text
editable Architecture + active Challenge + session
                  │
                  ▼
WebMcpEvidenceSource builds/reuses prepared current evidence
                  │
                  ▼
WebMCP adapter resolves production group → document.modelContext.registerTool
                  │                                      │
                  ▼                                      ▼
           tool invocation                    shared registry invocation
                                                       │
                                    read evidence / visual intent / simulated experiment
                                                       │
                  ┌────────────────────────────────────┴──────────────────────────────────┐
                  ▼                                                                       ▼
          validated evidence envelope                                 page-owned visual/experiment bridge
```

`WebMcpRegistration` creates the default shared registry and passes a live
evidence source to `registerAgentWebMcpSurface`. A separate `AbortController`
owns each registration generation; cleanup aborts it. The browser-facing status
reports `unsupported`, `registering`, `ready`, `partial`, `failed`, or
`disabled`, including per-mode registered/failed tool counts.

The package uses a 2-second registration deadline for UI status. It does not
cancel or make gameplay depend on a slow browser registration.

## Current evidence and freshness

`createWebMcpEvidenceSource` builds an exact UI-free evidence key from:

- canonical architecture (components, deployments, and connections sorted by
  stable IDs; no `ui` coordinates);
- active challenge;
- current `SIMULATOR_VERSION`; and
- the WebMCP evidence contract marker.

It caches prepared evidence for that exact key, deduplicates one in-flight
build, retains a bounded history for review comparison, and can retain the last
player-visible run as a comparison baseline. It builds indexes and compact
review packets beside the context; those are adapter-facing evidence aids, not
new simulator truth.

Each tool execution acquires a `WebMcpEvidenceLease` containing a
`LiveAgentSnapshot`, evidence revision, surface revision, and session revision.
Before an invocation it checks current availability; every capability call goes
through `AgentCapabilityRegistry.invoke`, which validates input and enforces
live experiment consent. After execution, the adapter checks whether the lease
is still current. A superseded read is retried once on a fresh lease; otherwise
the caller receives a controlled stale/superseded error response rather than a
claim about the newer board.

Do not reuse old chat content, selection, annotation state, or a previous
result for a current-board assertion. Build a current context and use the
shared evidence fingerprint/revision utilities.

## Tool adaptation and results

`toWebMcpTool` maps a shared `AgentCapability` to the minimal browser tool
shape:

- `name`, host-facing `title` and compact description;
- the shared `inputSchema.jsonSchema` without adapter-specific reconstruction;
- safe WebMCP annotations derived from shared annotations; and
- an async executor backed by the shared registry.

Some tools that can return player-authored material are marked with
`untrustedContentHint`. Only `readOnlyHint` and `untrustedContentHint` are
mapped to browser tool annotations. The read surface requires both
`readOnlyHint` and `idempotentHint`; visual and experiment builders reject a
positive `destructiveHint`.

Successful object results are wrapped in the shared evidence envelope. The
adapter projects quantitative evidence, separates player-authored content,
filters follow-up suggestions to tools in the active surface, derives or
validates a presentation cue, and attaches:

- provenance (architecture revision, simulator/run identity, freshness, mode,
  and simulated status where applicable);
- known state (evidence/session/surface revisions, digest, request
  fingerprint);
- up to three next-tool suggestions;
- truncation information when supplied by a capability; and
- validated subjects and presentation framing.

The adapter validates the completed envelope before returning it. Controlled
capability errors are sanitized to `NOT_FOUND`, `SIMULATION_UNAVAILABLE`,
`INVALID_INPUT`, `CANCELLED`, or `CONSENT_REQUIRED`, with safe recovery fields
only. Unexpected failures return a generic error; development diagnostics may
log locally, but stack traces are not exposed to agents.

## Visual and experiment effects

WebMCP tools do not receive architecture-edit powers.

- Visual capabilities return shared, validated intents. The adapter publishes
  only supported focus/annotation/connection/clear/region/pin intents to the
  web app’s single `createVisualCommandPublisher`, which applies them to the
  page-owned agent session or presentation callbacks.
- A presentation cue derived from a read result is advisory. It is validated
  against the evidence revision before its callback runs; a callback error does
  not prevent the evidence response.
- Experiment capabilities remain on a separate surface. The shared registry
  requires exact, revision-bound, five-minute human consent for a live session.
  The adapter publishes only successful results marked `simulated: true`,
  deduplicated by result digest for the lifetime of that tool instance.

Visual marks, viewport focus, playback, and experiment panels are not
architecture state, simulator input, official-submission input, or persistent
competition evidence. Experiments do not modify the player’s design.

## Registration lifecycle and observability

`registerAgentWebMcpSurface` first builds a coherent manifest from one prepared
context, then registers each tool through `modelContext.registerTool` with the
generation’s abort signal. It records resolved, registered, failed, and
per-mode tool names. A manifest includes the production contract version,
evidence revision, tools, skip names, and a fingerprint of host-visible tool
metadata.

Optional timing events cover registration/surface construction, context and
simulator work, capability execution, callback duration, and result bytes.
Trace events cover registration, invocation, leases, completion, and cue
lifecycle. Browser telemetry is allowlisted: it does not include prompts,
architecture JSON, accounts, or result payloads, and revisions are reduced to
a safe digest before emission.

`/dev/webmcp` is the current development inspector for registrations, traces,
timing, mock session signals, annotations, and manual invocation. It is not the
production capability profile.

## Change rules

| Change | Start with | Required follow-through |
| --- | --- | --- |
| Semantic tool, input/output, availability, consent | `@faultline/agent-capabilities` | Registry/resolver verifier first; adapt here only after shared behavior exists. |
| Production tool exposure/group | `capability-names.ts` in agent capabilities | WebMCP surface, tool-routing, and adapter-parity checks. |
| Browser API adaptation, envelope, safety, registration | `packages/webmcp/src` | Preserve shared schemas/results, cancellation, revision leases, and error sanitization. |
| Live context/evidence cache | `apps/web/lib/agent-context/`, `features/webmcp/evidence-store.ts` | Preserve UI-free identity and fresh simulator-grounded evidence. |
| Visual bridge or experiment presentation | `features/agent-session/visual-intent-bridge.ts`, workspace callbacks | Keep effects page-owned and unable to mutate canonical architecture. |
| Feature switch/status/telemetry | `features/webmcp/webmcp-config.ts`, `WebMcpRegistration.tsx` | Keep diagnostics allowlisted and WebMCP optional. |

Never implement a domain capability solely in `packages/webmcp` or
`apps/web`. Never use WebMCP results as official scoring input. Never expose
cross-origin registration options, server credentials, raw user content, or
unsanitized errors through this adapter.

## Verification

For adapter behavior:

```sh
pnpm --filter @faultline/webmcp verify
pnpm --filter @faultline/webmcp verify:compatibility
```

For the web lifecycle/evidence bridge, choose the nearest current script, for
example:

```sh
pnpm --filter @faultline/web verify:webmcp-polish
pnpm --filter @faultline/web verify:webmcp-performance
pnpm --filter @faultline/web verify:webmcp-evidence-store
pnpm --filter @faultline/web verify:live-agent-context-factory
pnpm --filter @faultline/web verify:agent-session
```

Changes to shared capability behavior also require:

```sh
pnpm --filter @faultline/agent-capabilities verify
pnpm verify:agent-context
```

Finally run `git diff --check` and inspect the diff. Test unsupported and
disabled states as well as successful registration: WebMCP must remain an
optional observer/coach of the running game.
