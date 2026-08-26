# AI

Embedded AI will interpret simulator evidence and help challenge a human design. It never invents metrics or decides correctness; the deterministic simulator does.

`packages/agent-capabilities` defines adapter-neutral semantic capability contracts. A capability has a name, description, validated input boundary, mode (`read`, `experiment`, or `visual`), availability predicate, execution contract, and optional annotations. The embedded AI and WebMCP adapters will consume that layer instead of duplicating business logic.

Business logic must live beneath adapters: future AI SDK and WebMCP implementations will delegate to the same semantic capability.

## Capability registry

`AgentCapabilityRegistry` registers Phase 5 read capabilities and exposes `list`, `available(context)`, and `invoke` (validate input → execute → `CapabilityResult`). Capabilities must not import the AI SDK.

`AgentContext` is an immutable per-request snapshot (`challenge`, `architecture`, optional simulation/cost evidence). Capabilities read that snapshot only.

## Capabilities

| Name | Mode | Purpose |
| --- | --- | --- |
| `get_challenge` | read | Compact challenge problem statement: workload, special scenarios, budget. Never reveals solutions. |
| `get_requirements` | read | Configured success criteria and deferred targets. Never evaluates pass/fail. |
| `get_architecture` | read | Compact semantic architecture from canonical state (config, deployments, connections; no UI). |
| `inspect_component` | read | One component: config, simulator metrics, and cost from AgentContext evidence. |
| `estimate_capacity` | read | Capacity/load/headroom and bottleneck from simulator evidence (optional componentId). |
| `get_metrics` | read | Compact simulator truth: system outcomes, component metrics, scenarios; explicit when unavailable. |

No AI integration endpoint is implemented yet.
