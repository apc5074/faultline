# AGENTS.md

## Product

Faultline is a daily distributed-systems design game.

Core rule:

> Human designs. Simulator determines truth. Agent challenges the design.

Current priority: ship one excellent Level 1 (Global URL Shortener) before adding breadth.

## Start Here

Before meaningful work:

1. Read the active ticket in the current phase plan (`plans/phase N/plan.md`).
   `plans/overall.md` is product vision, not an instruction to skip the active
   phase sequence.
2. Inspect the existing implementation.
3. Read only the relevant docs listed below.
4. Implement the smallest production-quality change that satisfies the ticket.
5. Keep the current Level 1 flow working.

Do not skip ahead to future phases unless required by the active ticket.

## Repository Map

- `apps/web` — Next.js product
- `packages/core` — shared domain contracts
- `packages/simulator` — deterministic simulation truth
- `packages/component-catalog` — component definitions
- `packages/challenges` — challenge definitions
- `packages/agent-capabilities` — shared semantic agent capabilities
- `packages/webmcp` — WebMCP adapter
- `supabase` — migrations/schema
- `docs` — durable architecture/domain documentation
- `plans/phase N/plan.md` — active execution plan and ticket order
- `plans/overall.md` — durable product vision and rationale

## Sources of Truth

Read only what is relevant:

- `plans/phase N/plan.md` — current implementation order
- `docs/ARCHITECTURE.md` — system boundaries
- `docs/SIMULATOR.md` — simulation semantics
- `docs/COMPONENTS.md` — component contract
- `docs/CHALLENGES.md` — challenge contract
- `docs/COST_MODEL.md` — deterministic cost rules
- `docs/AI.md` — embedded AI architecture
- `docs/WEBMCP.md` — WebMCP behavior
- `docs/PRODUCTION.md` — Vercel/Supabase production architecture

## Architectural Invariants

1. There is one canonical architecture model.
2. There is one deterministic simulator shared by browser and server.
3. The simulator, never an LLM, determines pass/fail.
4. Official leaderboard results are re-simulated server-side.
5. The human owns architecture changes during challenges.
6. Embedded AI and WebMCP share one agent capability registry.
7. Agent capabilities may depend on current architecture state.
8. Canvas and world map consume the same architecture state.
9. Geography must affect simulation where applicable.
10. Cost is a real challenge constraint.
11. Simulation emits events; UI animations consume them.
12. Challenges should score outcomes, not specific technologies.
13. New components register through the component catalog.
14. Build Level 1 before Level 2 breadth.

## Production

Primary stack:

- TypeScript
- Next.js
- Vercel
- Supabase/Postgres
- React Flow
- Vercel AI SDK
- Vercel AI Gateway
- WebMCP

Do not add infrastructure or dependencies without a current product need.

## AI

Embedded AI is the default user experience.

WebMCP exposes the same semantic capability layer to external agents.

Do not duplicate domain logic between AI SDK tools and WebMCP tools.

AI interprets simulator evidence; it does not invent metrics or decide correctness.

During active challenges agents may inspect, test, trace, and inject simulated failures, but must not modify the architecture.

## Level Development

Build components because a level needs them.

Level 1:
Service, Postgres, Redis, Router, Load Balancer, CDN, replicas, geography.

Level 2 adds:
Queue, Worker, Event Stream.

Level 3 adds:
Rate Limiter and correctness/flash-traffic primitives.

If Level 2 requires rewriting Level 1 fundamentals, reassess the abstraction.

## Working Style

Prefer:

- small cohesive changes
- explicit types
- deterministic logic
- schema validation at boundaries
- boring infrastructure
- minimal dependencies
- production-ready vertical slices

Avoid:

- speculative frameworks
- duplicated domain logic
- future-feature implementation
- giant refactors unrelated to the ticket
- component-specific challenge hacks

## Git Safety

Before editing:

`git status`

Do not discard unrelated changes or rewrite unrelated code.

Keep diffs scoped to the active ticket.

Inspect `git diff` before finishing.

## Verification

Early MVP work prioritizes production builds and targeted smoke testing.

Once formal tests exist, run checks relevant to the files changed.

Do not spend time on unrelated full-suite work unless required by the ticket.

## Definition of Good Work

A good change:

- completes the active ticket
- preserves architectural invariants
- keeps production buildable
- keeps Level 1 at least as playable as before
- introduces no unnecessary infrastructure
- leaves the next ticket easier to implement
