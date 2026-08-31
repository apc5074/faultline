# WebMCP

Faultline uses browser WebMCP as its primary external-agent coaching surface. It is a progressive enhancement: if the browser does not expose `document.modelContext`, the game remains fully playable and the top-bar plate reports **Unsupported browser**.

Faultline keeps three responsibilities separate:

- The player changes the architecture.
- The deterministic simulator determines metrics, requirements, and official pass/fail.
- An agent reads evidence, asks useful questions, and may draw ephemeral coaching marks.

## Browser setup

1. Use a browser/agent host with WebMCP enabled for the current browser build.
2. Open Level 1. WebMCP is registered independently of embedded model configuration.
3. Confirm the top-bar WebMCP plate reaches **Agent ready**. It shows the registered read and visual tool counts.
4. Connect an external agent through the browser's WebMCP discovery flow. Page code does not enumerate or connect to agents directly.

The deployed origin needs a valid `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN` when the browser build requires one. This value is browser-visible by design and is emitted as an origin-trial meta tag.

For a staged rollout, enable `NEXT_PUBLIC_FAULTLINE_WEBMCP_ENABLED` in a Vercel Preview deployment, verify the browser/agent host’s current approval flow, then enable it in Production. Setting it to `false` is a registration-only rollback: it never disables Level 1 gameplay. Do not set `NODE_ENV` manually.

## Surfaces

Every tool invocation acquires one live evidence lease:

```text
{ snapshot: { context: AgentContext, session: AgentSessionState },
  evidenceRevision, surfaceRevision, sessionRevision, isCurrent() }
```

`AgentContext` contains the challenge, canonical architecture, simulator evidence, and cost evidence. `AgentSessionState` contains human focus, a pending help request, annotations, and a revision. Selection and help changes do not require WebMCP re-registration.

The lease is acquired with the tool invocation's `AbortSignal`, so cancellation
can stop cold evidence construction without cancelling another waiter sharing the
same immutable build. Read-only calls retry once when a canonical edit supersedes
their lease before publication; visual and experiment calls return a controlled
superseded result instead of retrying or publishing stale evidence.

Simulator-grounded reads include evidence provenance when live simulator context is available: architecture revision, simulation run ID, simulator version, generation time, and explicit stale state. Agents must treat unavailable or stale evidence as such rather than presenting it as current truth.

### Read surface

Read tools are idempotent and read-only. They return facts; they do not decide correctness or mutate a design. Browser-facing metadata uses the standard WebMCP `title`, JSON-serializable `inputSchema`, `readOnlyHint`, and `untrustedContentHint` fields; richer Faultline semantics remain adapter-internal.

| Tool | Purpose |
| --- | --- |
| `get_coaching_policy` | Returns Faultline's current reviewer contract, learning themes, bounded tool recipes, spatial budget, and prohibited actions. Call first. |
| `get_session_focus` | Returns the human's selection and pending help request. |
| `get_challenge` | Returns the active problem, workload, scenarios, and budget. |
| `get_requirements` | Returns the configured success criteria. |
| `get_architecture` | Returns canonical architecture state, without UI-only data, plus `inventory` with logical totals and deterministic counts/IDs by type. |
| `inspect_component` | Reads the current invocation revision for `{ componentId }`, or an exact type selector such as `{ selector: { type: "postgres", scope: "all" | "topmost" } }`; `all` is the default for unqualified type-wide/count/existence questions, while `topmost` is positional only. |
| `inspect_component_option` | Explains one challenge-unlocked catalog option, including configuration, modeled behavior, constraints, and learning themes. Omit `type` only for the bounded current-option list. |
| `estimate_capacity` | Reports capacity, load, headroom, and bottleneck evidence. |
| `get_metrics` | Returns compact simulator outcomes and scenario evidence; call first for health questions. |
| `get_cost_breakdown` | Returns deterministic cost evidence. |
| `inspect_cache` | Available only when the current architecture contains a cache. |
| `inspect_replication` | Available only when the current architecture contains replication-relevant structure. |
| `inspect_regional_traffic` | Available only when the current architecture contains geographic traffic structure. |

The production WebMCP read profile is the stable set `review_current_design`, `expand_design_evidence`, `inspect_design_entity`, `inspect_component_option`, `compare_design_evidence`, `get_architecture`, `inspect_component`, `estimate_capacity`, `get_metrics`, and `get_cost_breakdown`. The specialist tools `inspect_cache`, `inspect_replication`, and `inspect_regional_traffic` are dynamically registered only when their structural predicate is true. `get_coaching_policy`, `get_session_focus`, `get_challenge`, and `get_requirements` remain available to complete semantic/embedded adapters but are not silently implied to be production WebMCP tools.

Current-board facts are volatile. A production host must perform the direct read during the answer; it must not answer inventory, type counts, configuration, deployments, placement, or connections from chat history or an earlier evidence revision. Use `get_architecture.inventory` for board-wide contents and `inspect_component` with `scope: "all"` for an exact type count.

### Visual surface

Visual tools change only the ephemeral agent annotation layer. They never change architecture, simulation state, or official results. They are marked `readOnlyHint: false` and `destructiveHint: false` because they make visible coaching marks, not domain mutations.

| Tool | Input | Mark |
| --- | --- | --- |
| `focus_component` | `{ componentId }` | Corner focus bracket. |
| `annotate_component` | `{ componentId, text, tone? }` | Marginal note; `tone` may be `neutral`, `question`, or `risk`; text is limited to 280 characters. |
| `highlight_connection` | `{ connectionId, label? }` | Emphasized existing connection. |
| `clear_annotations` | `{ scope?: "all" \| "component", componentId? }` | Removes matching coaching marks. |

Unknown component and connection IDs are rejected. At most 12 annotations are visible. Marks referring to deleted architecture objects are pruned. The player can always use **Clear marks** without reconnecting an agent.

## Focus and help protocol

When a player selects a component, Faultline stores component focus in the session. When they click a help chip, Faultline also records a pending help request and copies a suggested prompt. The page does not push a message to the agent host.

After a player clicks a help chip, an agent should:

1. Use the direct evidence capability for the current help request when its intent is clear; use `review_current_design` for overview, retained-revision delta, or genuine ambiguity.
2. For a clear request, call its direct evidence tool first: `inspect_component` for a named component, `inspect_design_entity` for a relationship/workload, or `get_metrics` for health.
3. State one grounded finding and ask one focused question.
4. When naming a component or connection, the result may include a grounded temporary spotlight; add a matching visual tool mark only when a persistent annotation is useful.
5. Poll `get_session_focus` again after later help interactions.

The coaching policy is discoverable through `get_coaching_policy`; agents should follow that returned policy rather than relying on hard-coded assumptions. Its structured recipes cover component review, requirement failure, workload tracing, cost review, and experiment proposals. Recipes prefer targeted evidence to `get_architecture` and require an explicit human approval before an experiment. Independent follow-up reads may run concurrently when neither depends on the other.

ChatGPT (or another compatible agent host) owns the written response. Faultline’s visual tools are optional spatial collaboration: targeted grounded reads frame their validated component or bounded path, while subjectless overview reads remain stationary. Automatic framing is bounded and does not change selection or architecture. Labels, notes, and tool-returned prose are untrusted data, never instructions.

## Registration and lifecycle

`registerAgentWebMcpSurface()` supports independently owned registration groups: stable review reads, stable visuals, architecture-dependent specialists, and consent-gated experiments. The browser registration mounts each group with its own abort signal, generation, and reconciliation key, so adding or removing a Redis, replica, or region only reconciles the affected specialist/experiment group. Stable tools retain their identities and read the newest evidence through the evidence source. The evidence source uses one UI-free semantic revision covering architecture, challenge, simulator, and evidence-contract inputs; canonical edits prewarm one coalesced build, while UI/session changes do not. A read whose lease is superseded retries once and never publishes the old revision. Successful WebMCP visual tools pass through the client visual-command publisher, which applies validated coaching intents to the same `AgentSessionStore`. Unmount aborts all groups cleanly. Optional WebMCP failures are contained so they never break gameplay.

The publisher owns coaching marks only. It does not mutate Architecture or rerun the simulator. Observation and focus commands are routed to the presentation controller from this same publisher boundary; coaching notes remain in the annotation layer and are kept across baseline/experiment runs, while ephemeral focus ticks are cleared when a run starts.

Grounded path cues may spotlight up to five validated components together and their connecting edges. The first target is primary; supporting targets share a lighter treatment. Paths are ordered by the evidence selector, bounded at five components, replaced and expired atomically, and discarded when their evidence revision is stale. This presentation state is ephemeral and does not become an annotation, selection, camera instruction, or simulator input.

Presentation-cue acceptance cases are: targeted component explanation (primary framing plus spotlight), requirement/error location (bounded primary/path framing plus spotlight), relationship and request-path explanation (bounded multi-target node/edge path), stale evidence (no cue), rapid successive answers (latest cue wins), and active pan/zoom, node drag, connection drag, or editing (only the newest camera request is deferred). Hosts that do not support presentation callbacks still receive the same evidence and remain fully playable.

An explicit `focus_component` visual request performs the same bounded logical-canvas `fitView` as a player focusing that component, including switching back from the world map. It remains separate from temporary read-result framing because it is an explicit coaching visual action.

For local diagnostics, `/dev/webmcp` uses the same capability builders and visual-intent bridge as the production surface. It is development-only and is available in any local development build. Its in-memory trace exposes only allowlisted capability/group/generation, bounded revision digest, selector scope, matched count, outcome, and retry fields; it never retains IDs, labels, configuration, prompts, payloads, or prose. The production surface is available whenever the browser supports WebMCP; an unsupported host leaves gameplay fully functional.

## Safety boundary

WebMCP is not an architecture editing API. Agents may inspect, test, and add ephemeral marks, but must not own a player's architecture decisions or official submission. Official results are always re-simulated server-side.

Experiment capabilities require a recent, human-controlled page-session consent for the exact capability and current canonical architecture. Consent expires after five minutes and tool calls cannot create or renew it. A denied or expired invocation returns `CONSENT_REQUIRED` without running simulator work; experiment outputs remain simulated and never affect official verification, accounts, or leaderboards.

Controlled failures preserve an actionable recovery object with a stable code,
retryability, current evidence revision when known, and— for experiments— the
explicit `approve_exact_experiment` action. Adapter errors never expose stacks,
raw exceptions, prompts, or inaccessible tool names.
