# Codex project memory

This is the short operational guide for agents editing Faultline. It complements
the product and architecture documents; it does not replace the active phase
plan or package source code.

## Working snapshot

- Product: Faultline, a daily distributed-systems design game.
- Product rule: the human changes the architecture, the deterministic simulator
  determines truth, and the agent inspects or challenges the design.
- Current priority: finish an excellent Level 1 Global URL Shortener before
  adding breadth.
- Active curriculum plan: `plans/level/1/plan.md` (Level Profiles LP-01…LP-08).
  Affinity foundation is in `plans/level/plan.md` (T-01…T-10 shipped; **T-11**
  human playtest is the remaining exit — confirm fail-first starter + CDN≫Redis
  share visuals). **Geography completeness:** `plans/geo.md` (GEO-01…05 shipped —
  absorb-then-route, CDN offload, miss-path LB/Router, regional Service capacity,
  independent regional Redis footprints, Postgres primary/replica geo rules, geo
  latency under absorb, hot-key geo path, geo transfer cost, geo requirements
  aggregation, Service scaling UX, Router/LB inspector teaching, Traffic Source
  origin hardening, Postgres/Redis regional controls, World map arcs; next
  logical playback under geo, geo failure hooks, docs sync; next
  **GEO-20** geo verification umbrella).
  Older phase plans under
  `plans/phase N/` apply only when the ticket points there.
- The worktree may contain unfinished user changes. Run `git status` first and
  preserve unrelated edits.

## Where changes belong

| Need | Start here | Keep out of |
| --- | --- | --- |
| Serializable architecture, IDs, regions, experiment contracts | `packages/core/src` | React components and adapters |
| Component definitions and ports | `packages/component-catalog/src` | Challenge-specific conditionals |
| **New levels / curriculum** | `packages/challenges/src/levels/*.level.json` then compile helpers | Dual-maintained TS challenge bodies; simulator slug branches |
| Level rules, workload, targets, validation | `packages/challenges/src` | UI and agent capability code |
| Traffic, capacity, latency, geography, cost, experiments, events | `packages/simulator/src` | Browser-only presentation logic |
| Agent schemas, capability execution, resolver, session context | `packages/agent-capabilities/src` | AI SDK and WebMCP adapters |
| AI SDK tool conversion and request/session wiring | `apps/web/lib/ai` | Duplicated domain execution |
| WebMCP registration and adapter behavior | `packages/webmcp/src` | A second capability registry |
| Canvas, map, playback, annotations, panels | `apps/web/features` | New simulator semantics |
| Persistence, official attempts, server re-simulation | `apps/web/lib`, `apps/web/app/api`, `supabase` | Client-only result authority |
| Account identity, OAuth linking, history, streak | `docs/ACCOUNTS.md`, `apps/web/lib/auth` | Simulator or client-supplied user IDs |

Use package barrel exports (`src/index.ts`) when a contract is public. Follow an
existing import path before creating a new abstraction.

## Edit routing checklist

1. Read the relevant ticket in the active plan (`plans/level/1/plan.md` for Level
   Profiles, or `plans/phase N/plan.md` when that ticket governs) and its
   dependency gate.
2. Read only the contract docs needed for that ticket:
   `ARCHITECTURE`, `SIMULATOR`, `COMPONENTS`, `CHALLENGES`, `COST_MODEL`,
   `AI`, `WEBMCP`, `ACCOUNTS`, or `PRODUCTION`.
3. **New level work starts at a Level Profile JSON** under
   `packages/challenges/src/levels/`. Compile into `ChallengeDefinition`; do not
   hand-maintain a second affinity/workload table in TS. Follow the Extending
   affinity checklist in `docs/CHALLENGES.md` for new mechanisms.
4. Locate the canonical type/function and its barrel export before editing a
   consumer. Do not recreate a domain calculation in the UI.
5. For a new component, update the component catalog and challenge allowance;
   do not add a component-specific simulator shortcut.
6. For new agent behavior, add one adapter-neutral capability first, then use
   the existing AI SDK and WebMCP adapters. Resolve availability from the live
   architecture/context rather than hard-coding it in a React component.
7. For visuals, consume complete simulator/result event batches (and LP-05 share
   mapper over absorb RPS). Presentation state is ephemeral and must never become
   architecture or official-submission input. Profile `volumeProfile` bands are
   playtest guards only — not scored shares.
8. Validate untrusted architecture, capability input, and adapter payloads at
   their boundary with the existing schemas/parsers (`assert*` — no Zod).
9. Inspect `git diff` before finishing and report targeted checks run.

## Non-negotiable boundaries

- `@faultline/simulator` is deterministic and independent of React, the DOM,
  AI, Supabase, and network calls.
- The same canonical `Architecture` feeds the logical canvas, world map,
  simulator, agent context, and official submission validation.
- The simulator—not an LLM or browser heuristic—owns pass/fail, metrics,
  routing, capacity, latency, cost, and experiment outcomes.
- WebMCP uses shared semantic capabilities and schemas. The adapter translates
  and registers them without duplicating domain logic.
- Agents may inspect, annotate, and run explicitly supported temporary
  experiments, but may not mutate architecture, official attempts, or
  leaderboard state.
- Geography, workload affinity, cache behavior, hot-key behavior, and cost are
  real modeled constraints when the active challenge enables them.
- Visual animation is bounded presentation of authoritative events. Never add
  ambient/fake traffic, random routing, inferred cache hits, or unmodeled
  resource metrics.
- A simulator-semantic change requires reviewing `SIMULATOR_VERSION` and the
  challenge publishing/official-score implications.

## Verification map

Start with the smallest check that covers the changed boundary, then run the
repository typecheck/build when the change crosses packages.

| Changed area | First targeted check | Broader check |
| --- | --- | --- |
| Core contracts | `pnpm --filter @faultline/core verify` | `pnpm typecheck` |
| Catalog | `pnpm --filter @faultline/component-catalog verify` | `pnpm typecheck` |
| Challenge rules | `pnpm --filter @faultline/challenges verify` | `pnpm typecheck` |
| Level Profiles (schema, Level 1 JSON, starter, share visuals, teaching) | `pnpm verify:level-profiles` | `pnpm --filter @faultline/challenges verify` |
| Simulator semantics | `pnpm --filter @faultline/simulator verify` | `pnpm build` |
| Workload affinity (helpers, placement, Level 1 calibration, agent fit, UI evidence) | `pnpm verify:affinity` | `pnpm --filter @faultline/simulator verify` |
| Agent capabilities | `pnpm --filter @faultline/agent-capabilities verify` | `pnpm typecheck` |
| WebMCP adapter | `pnpm --filter @faultline/webmcp verify` | `pnpm typecheck` |
| Web UI behavior | the matching `apps/web` `verify:*` script | `pnpm build` |
| Geography completeness | `pnpm verify:geo` | `pnpm build` |

Useful focused web checks include `verify:agent-session`,
`verify:dynamic-surface-parity`, `verify:workload-evidence`,
`verify:level1-starter`, `verify:volume-share-visuals`, `verify:level-teaching`,
`verify:authoritative-traffic-tokens`, `verify:presentation-playback`, and
`verify:presentation-events` when those files are involved. For Level Profile lock across challenges + web, prefer
`pnpm verify:level-profiles` from the repo root. For affinity foundation lock,
prefer `pnpm verify:affinity`. Check `apps/web/package.json` for the current
script name; don’t invent a command from an older phase.

## Common traps

- `ui` coordinates and view mode are presentation state, not simulator input.
- Regional deployments are placement of one logical component, not a second
  architecture model. Regional capacity totals must match logical totals.
- Postgres read and write pressure are distinct; replicas do not shard one
  viral hot key, and writes remain primary-only.
- Geographic latency is supplied by simulator results. Do not copy the latency
  matrix into UI code or double-count round trips.
- A cold cache, failed component, failed region, or reroute in an experiment is
  simulated evidence. Never label it as a real outage or show invented repair,
  failover, or promotion.
- Stale results must remain visibly stale after an architecture edit. Do not
  silently reuse them as current evidence.
- Any routing capability named in production guidance must be present in the
  production manifest and tested through the registered production surface;
  capability unit tests cannot substitute for a registered-surface regression.
- Keep timers in one playback/controller layer. Cards, edges, map arcs, and
  chat should consume derived state rather than each scheduling animation.
- Do not add Level 2/3 components or infrastructure unless the active ticket
  requires them.
- New levels author as Level Profiles (`*.level.json`); do not treat the hero
  scene as the playground starter. Volume bands are teaching/playtest only.

## Candidate memory files

Keep durable, cross-cutting rules here and in the root `AGENTS.md`. Add more
files only when a directory has local rules that would otherwise be repeated in
every task.

| Priority | Candidate | Add when |
| --- | --- | --- |
| P0 | `AGENTS.md` | A repository-wide invariant or workflow changes |
| P0 | `docs/CODEX.md` (this file) | Editing routes, traps, verification, or project snapshot change |
| P1 | `packages/simulator/AGENTS.md` | Simulator-specific determinism/test conventions recur in tasks |
| P1 | `packages/agent-capabilities/AGENTS.md` | Capability schema/resolver/adapter parity rules need local examples |
| P1 | `apps/web/AGENTS.md` | UI work repeatedly needs playback, stale-state, and client/server boundaries |
| P2 | `packages/webmcp/AGENTS.md` | WebMCP lifecycle and registration details grow beyond `docs/WEBMCP.md` |
| P2 | `docs/DECISIONS.md` | Several architecture decisions need dated rationale, not task instructions |

Do not create a generic `memory.md` full of transient status. Put changing work
status in the phase plan, durable semantics in the domain docs, and stable edit
guidance in this file.
