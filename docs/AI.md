# AI

Faultline's coaching interface is an external agent connected through browser WebMCP. The web app exposes the same semantic capability layer to compatible browsers without embedding a model or agent UI.

Neither interface decides whether a design passes. The deterministic simulator is the source of truth for metrics, requirements, cost, and official scoring.

## Shared semantic layer

`packages/agent-capabilities` defines adapter-neutral capability contracts. A capability has a validated input boundary, mode (`read`, `visual`, or reserved `experiment`), availability predicate, execution contract, and safety annotations.

Domain logic lives below the adapter. WebMCP delegates to this shared registry rather than duplicating architecture, simulator, or cost rules.

Each invocation receives a fresh `AgentContext` plus `AgentSessionState`:

- `AgentContext`: challenge, canonical architecture, and optional simulation/cost evidence.
- `AgentSessionState`: current human focus, pending help request, annotations, and revision.

The session helps an agent respond to human intent; it does not authorize an agent to edit architecture.

## Coaching behavior

Agents must call `get_coaching_policy` before coaching. The policy requires an interviewer/reviewer voice: inspect evidence before asserting, provide one finding and one question, and do not reveal a canonical topology or solution thresholds.

Use simulator evidence when available and say when it is unavailable. Do not invent metrics, infer pass/fail independently, or prescribe a single technology stack as the answer.

When discussing a named component or existing connection, an external agent should use the appropriate visual capability so the player can see the reference on the canvas. Visual marks are annotations only.

## Official competition

An agent may help a player inspect a design, but it must not submit, score, or modify it. Official submission is server-side: the server re-simulates the submitted canonical architecture and ignores browser-provided metrics and pass/fail claims.

See [WEBMCP.md](./WEBMCP.md) for the exact external tool catalog and [WEBMCP_COMPETITION.md](./WEBMCP_COMPETITION.md) for the competitor configuration prompt and fair-play rules.
