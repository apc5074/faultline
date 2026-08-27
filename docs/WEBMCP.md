# WebMCP

Faultline uses browser WebMCP as its primary external-agent coaching surface. It is a progressive enhancement: if the browser does not expose `document.modelContext`, the game remains fully playable and the top-bar plate reports **Unsupported browser**.

Faultline keeps three responsibilities separate:

- The player changes the architecture.
- The deterministic simulator determines metrics, requirements, and official pass/fail.
- An agent reads evidence, asks useful questions, and may draw ephemeral coaching marks.

## Browser setup

1. Use a browser/agent host with WebMCP enabled for the current browser build.
2. Open Level 1 with `NEXT_PUBLIC_FAULTLINE_AI_ENABLED=true`.
3. Confirm the top-bar WebMCP plate reaches **Agent ready**. It shows the registered read and visual tool counts.
4. Connect an external agent through the browser's WebMCP discovery flow. Page code does not enumerate or connect to agents directly.

The deployed origin needs a valid `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN` when the browser build requires one. This value is browser-visible by design and is emitted as an origin-trial meta tag.

## Surfaces

Every tool invocation reads a fresh live snapshot:

```text
{ context: AgentContext, session: AgentSessionState }
```

`AgentContext` contains the challenge, canonical architecture, simulator evidence, and cost evidence. `AgentSessionState` contains human focus, a pending help request, annotations, and a revision. Selection and help changes do not require WebMCP re-registration.

### Read surface

Read tools are idempotent and read-only. They return facts; they do not decide correctness or mutate a design.

| Tool | Purpose |
| --- | --- |
| `get_coaching_policy` | Returns Faultline's current coaching constraints and focus themes. Call first. |
| `get_session_focus` | Returns the human's selection and pending help request. |
| `get_challenge` | Returns the active problem, workload, scenarios, and budget. |
| `get_requirements` | Returns the configured success criteria. |
| `get_architecture` | Returns canonical architecture state, without UI-only data. |
| `inspect_component` | Inspects a named component and related simulator/cost evidence. |
| `estimate_capacity` | Reports capacity, load, headroom, and bottleneck evidence. |
| `get_metrics` | Returns compact simulator outcomes and scenario evidence. |
| `get_cost_breakdown` | Returns deterministic cost evidence. |
| `inspect_cache` | Available only when the current architecture contains a cache. |
| `inspect_replication` | Available only when the current architecture contains replication-relevant structure. |
| `inspect_regional_traffic` | Available only when the current architecture contains geographic traffic structure. |

The first nine are baseline tools. The final three are dynamically registered only when their structural predicate is true.

### Visual surface

Visual tools change only the ephemeral agent annotation layer. They never change architecture, simulation state, or official results. They are marked `readOnlyHint: false` and `destructiveHint: false` because they make visible coaching marks, not domain mutations.

| Tool | Input | Mark |
| --- | --- | --- |
| `focus_component` | `{ componentId }` | Corner focus bracket. |
| `annotate_component` | `{ componentId, text, tone? }` | Marginal note; text is limited to 280 characters. |
| `highlight_connection` | `{ connectionId, label? }` | Emphasized existing connection. |
| `clear_annotations` | `{ scope?: "all" \| "component", componentId? }` | Removes matching coaching marks. |

Unknown component and connection IDs are rejected. At most 12 annotations are visible. Marks referring to deleted architecture objects are pruned. The player can always use **Clear marks** without reconnecting an agent.

## Focus and help protocol

When a player selects a component, Faultline stores component focus in the session. When they click a help chip, Faultline also records a pending help request and copies a suggested prompt. The page does not push a message to the agent host.

After a player clicks a help chip, an agent should:

1. Call `get_session_focus`.
2. Call the relevant evidence tools, starting with `inspect_component` when focus names a component.
3. State one grounded finding and ask one focused question.
4. When naming a component or connection, add a restrained visual mark with the matching visual tool.
5. Poll `get_session_focus` again after later help interactions.

The coaching policy is discoverable through `get_coaching_policy`; agents should follow that returned policy rather than relying on hard-coded assumptions.

## Registration and lifecycle

`registerAgentWebMcpSurface()` registers both surfaces with a shared `AbortSignal`. The canvas reconciles registration when the challenge/architecture availability fingerprint changes. Unmount aborts registration cleanly. Optional WebMCP failures are contained so they never break gameplay.

For local diagnostics, `/dev/webmcp` uses the same capability builders and visual-intent bridge as the production surface. It is development-only and requires the AI feature flag.

## Safety boundary

WebMCP is not an architecture editing API. Agents may inspect, test, trace, and add ephemeral marks, but must not own a player's architecture decisions or official submission. Official results are always re-simulated server-side.
