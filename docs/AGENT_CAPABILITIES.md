# Agent capability contract

`@faultline/agent-capabilities` is the adapter-neutral boundary for every agent
operation. It turns a current `AgentContext` and validated input into a bounded
result. Browser WebMCP and any future host adapt this layer; neither owns a
second simulator, architecture model, cost model, or capability implementation.

This document describes the current contract in
`packages/agent-capabilities/src`. For WebMCP registration/lifecycle details,
see `packages/webmcp/src` and `docs/WEBMCP.md`.

## Capability model

Each `AgentCapability` has:

| Field | Meaning |
| --- | --- |
| `name` | Stable semantic operation name. |
| `description` | Adapter-neutral intent. Host-facing descriptions may be a compact adaptation, not a separate behavior definition. |
| `inputSchema` | Shared JSON Schema subset plus `safeParse`. Adapters pass this schema through; they do not rebuild validation per host. |
| `mode` | `read`, `visual`, or `experiment`. |
| `availableWhen` | Pure context predicate that decides whether the operation is relevant now. |
| `execute` | Shared implementation operating on the supplied context and validated input. |
| `annotations` | Safe-invocation metadata used by surfaces, such as read-only/idempotent or destructive hints. |
| `exposure` | Optional production group metadata. The canonical manifest supplies it for known production capabilities. |

Register a new semantic behavior in `packages/agent-capabilities/src/capabilities`
and `createDefaultCapabilityRegistry` before adapting it. A duplicate name is
an error. Do not add a WebMCP-only executor for domain behavior.

## Context and evidence

Every invocation receives an immutable `AgentContext` containing canonical
architecture and challenge data, plus optional simulator-derived evidence,
cost, requirement outcomes, teaching slice, and review packets.

Simulator-grounded evidence carries `EvidenceMeta`:

- `architectureRevision` identifies the semantic architecture (without UI
  coordinates).
- `simulationRunId` identifies the evidence-producing run/context.
- `simulatorVersion` identifies the simulator semantics.
- `isStale` and `generatedAt` communicate freshness.

If simulation evidence is absent or unavailable, a capability must represent
that state rather than manufacture a metric. Capabilities present simulator
facts; they do not recompute component capacity, cost, pass/fail, or topology
rules from their own formulas.

Hosts must build/read current context for a current-state answer. Chat history,
visual selection, annotations, and an earlier result are not current board
evidence. The WebMCP adapter obtains fresh context for invocation and rejects
or retries when the evidence revision is superseded.

## Modes and safety

| Mode | May do | Must not do |
| --- | --- | --- |
| `read` | Return current architecture, challenge, simulator, cost, or derived review facts. | Change architecture, session state, official attempts, or leaderboard data. |
| `visual` | Return a validated focus, annotation, highlight, clear, region-focus, or observation intent for the host to apply to presentation state. | Mutate the canonical architecture or make visual state evidence of simulator truth. |
| `experiment` | Return a temporary simulated baseline/outcome/delta/event result. | Persist an overlay, alter Architecture/ChallengeDefinition/catalog config, or submit an official result. |

The registry validates inputs before executing. Its controlled error result is
one of `NOT_FOUND`, `SIMULATION_UNAVAILABLE`, `INVALID_INPUT`,
`CONSENT_REQUIRED`, or `CANCELLED`; adapters must preserve the error shape and
avoid leaking implementation stack traces.

Visual references are checked against current component/connection IDs. Notes
are bounded, annotations are pruned when their targets disappear, and the
session focus/help target is likewise pruned after architecture edits.

## Human consent for experiments

Live-session experiments require page-owned consent for the exact capability
name. Consent is tied to the semantic architecture revision, expires after five
minutes, and becomes invalid as soon as that architecture changes. A tool call
cannot grant its own consent.

The registry enforces this when a live `AgentSessionState` accompanies an
experiment invocation. On missing/expired/mismatched consent it returns
`CONSENT_REQUIRED` with `approve_exact_experiment`. Experiment-result caching
is scoped to the exact capability, architecture revision, input, and consent
window; it does not make a result persistent.

## Capability surfaces

The default registry contains more capabilities than any one production host
must expose. Resolution is deterministic and uses `availableWhen(context)`.
Missing baseline registrations fail in development/verification and are safely
reported as skipped by production surfaces.

### Read capabilities

The shared read resolver starts with these general-purpose operations:

```text
review_current_design        expand_design_evidence      compare_design_evidence
inspect_design_entity        inspect_component_option    get_coaching_policy
get_session_focus            get_challenge               get_requirements
get_architecture             inspect_component           estimate_capacity
get_metrics                  get_cost_breakdown
```

The resolver then conditionally adds specialists:

| Capability | Available when the canonical architecture has… |
| --- | --- |
| `inspect_cache` | A Redis component. |
| `inspect_replication` | A Postgres replica configuration or deployment. |
| `inspect_regional_traffic` | Deployments in at least two known regions. |
| `inspect_queue` | A Queue component. |
| `inspect_processing` | A Worker component. |
| `inspect_object_storage` | An Object Storage component. |
| `inspect_playback_origin` | A CDN or Object Storage component. |

`inspect_bottlenecks` is registered as a read capability but is not part of the
general read resolver list. It is therefore not automatically exposed by the
current production manifest.

### Visual capabilities

The shared baseline visual resolver contains:

```text
focus_component  annotate_component  highlight_connection  clear_annotations
focus_region     pin_observation
```

The current production manifest exposes the first four. `focus_region` and
`pin_observation` remain shared capabilities but are not production WebMCP
tools unless the manifest changes intentionally.

### Experiment capabilities

The production experiment resolver selects these operations when their own
availability predicates pass:

```text
run_load_test             change_traffic_pattern
flush_cache               inject_component_failure
inject_region_failure     slow_consumers
```

They are registered on a separate surface from reads. They model temporary
simulated conditions and require explicit human intent/consent in a live
session.

## Production manifest and adapter behavior

`PRODUCTION_CAPABILITY_MANIFEST` is the source of truth for the current
production WebMCP exposure. It groups exposed capability names as
`stable-review`, `specialists`, `stable-visual`, or `experiments` and has the
contract version `wmp-production-1`.

The WebMCP adapter:

1. resolves capabilities from one prepared current context;
2. filters them by the intended production group and safety annotations;
3. converts each shared input schema and executor to a host tool;
4. invokes the registry with current evidence/session state;
5. envelopes successful results with provenance and filters follow-up hints to
   the currently registered tools; and
6. publishes only validated visual intents, presentation cues, or simulated
   experiment results to page-owned handlers.

Registration is a host integration concern. It must not change capability
availability, shared result semantics, or simulator truth. Keep registry and
adapter parity checks green whenever a shared capability or manifest changes.

## Adding or changing a capability

1. Identify whether the behavior is read, visual, or experiment. Do not use a
   visual tool as an architecture-edit backdoor.
2. Define a narrow input schema and a controlled output/error shape in the
   shared package.
3. Build from `AgentContext` and existing simulator/domain results. Add a
   domain helper below the capability only if the behavior is genuinely shared.
4. Write a pure `availableWhen` predicate when the architecture makes the tool
   conditional; add its facts to the availability fingerprint only when they
   affect tool presence.
5. Register it in `createDefaultCapabilityRegistry` and add focused verification.
6. Add it to the production manifest only with an intentional group, appropriate
   annotations, and adapter-surface coverage. Being registered does not imply
   production exposure.
7. For experiments, ensure the simulator result is temporary and the live
   consent path remains exact, expiring, and revision-bound.

## Verification

- Shared schemas, execution, resolver behavior, session/consent, and capability
  coverage: `pnpm --filter @faultline/agent-capabilities verify`
- WebMCP conversion, registered surfaces, lifecycle, and adapter parity:
  `pnpm --filter @faultline/webmcp verify`
- End-to-end web evidence/context integration: `pnpm verify:agent-context`
- Cross-package public-contract changes: `pnpm typecheck`

Use the nearest existing capability verifier for a focused regression first;
extend it when a new input, availability condition, evidence field, consent
rule, or production exposure is introduced.
