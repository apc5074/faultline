# Faultline agent guide

Faultline is a systems-design game. A player edits an architecture; shared,
deterministic code evaluates it; an agent can inspect, annotate, and run
explicitly supported simulated experiments. The simulator—not a UI heuristic or
language model—decides metrics, requirements, cost, and official eligibility.

This file is repository-wide policy. Read [`docs/CODEX.md`](docs/CODEX.md) for
the current code map, edit routing, and command selection.

## Trust order

Use the current implementation as the factual source of truth:

1. Public types, implementations, registrations, migrations, and route code.
2. Verification scripts and package scripts that exercise those contracts.
3. This guide and focused domain docs, which explain durable intent.
4. Plans, tickets, and historical notes, which may define requested scope but
   do not establish current behavior by themselves.

When prose and code disagree, do not silently preserve the prose. Verify the
behavior in code, implement the requested change against that behavior, and
update the relevant durable documentation in the same change when it is now
wrong.

## Repository shape

| Area | Owns |
| --- | --- |
| `packages/core` | Serializable domain contracts: architecture, connections, regions, challenges, workloads, and experiment envelopes. |
| `packages/component-catalog` | The registered component catalog, config schemas, ports, defaults, and component metadata. |
| `packages/challenges` | Challenge definitions, Level Profile schema/compilation, curriculum helpers, and config hashing. |
| `packages/simulator` | Deterministic validation, traffic/capacity/latency/cost/requirements, geography, workload paths, and experiments. |
| `packages/agent-capabilities` | Adapter-neutral capabilities, schemas, evidence, session/consent rules, and capability resolution. |
| `packages/webmcp` | Browser WebMCP adaptation, registration, visual intent, error handling, and lifecycle behavior. |
| `apps/web` | Next.js routes and product UI: canvas, map, playback, agent session, official attempts, and server adapters. |
| `supabase/migrations` | Append-only database schema, RLS, functions, and competition/account persistence rules. |

## Non-negotiable contracts

- There is one canonical `Architecture` (`@faultline/core`). Component and
  connection IDs are stable; `ui` coordinates are presentation data only.
- The component registry is the only catalog registration boundary. Do not add
  component behavior solely in React, a challenge, or an agent tool.
- Challenges define workload and outcome requirements. They may limit the
  sandbox, but must not score a prescribed topology or named component.
- The simulator is deterministic and framework/provider independent. UI,
  adapters, and server routes consume its results; they do not recalculate its
  formulas.
- Simulator validation is stricter than structural architecture parsing. Use
  the public parser/validator at untrusted boundaries and simulator evaluation
  for simulation-specific validity.
- Regional deployments are placement of a logical component in the same
  architecture, not another architecture model. Logical capacity totals and
  deployment capacity must agree where the simulator requires it.
- Agent capabilities are semantic operations in `@faultline/agent-capabilities`.
  WebMCP is an adapter, not another source of domain logic.
- Agents never mutate the player's canonical architecture, submit official
  attempts, or write leaderboard state. Experiments are typed, temporary
  simulator overlays and require the existing human-consent path when invoked
  through a live agent session.
- Official submission is server-authoritative: bind an authenticated attempt to
  a trusted challenge snapshot, validate the submitted architecture, run the
  shared simulator, then persist the verified result. Never accept browser
  claims for metrics, cost, pass/fail, time, or eligibility.
- Playback, annotations, selection, view mode, and stale-result state are
  ephemeral presentation/session state. They must not become simulation or
  official-submission input.

## Working procedure

1. Run `git status --short`. Preserve unrelated work.
2. Locate the owning package and its public entry point before changing a
   consumer. Follow current call sites and its verification script.
3. Read only the source and durable docs needed for that boundary. A task plan
   can constrain scope, but confirm all factual claims in current code.
4. Make the smallest cohesive change. Reuse existing contracts and validation
   patterns; do not add a dependency or parallel abstraction without a present
   product need.
5. Validate at the narrowest affected boundary, then broaden when a changed
   public contract crosses packages or reaches the web/server surface.
6. Inspect `git diff --check` and `git diff` before handoff. State what changed
   and which checks actually ran.

## Boundary rules

| If you change… | Start at… | Keep out of… |
| --- | --- | --- |
| Architecture shape, IDs, regions, experiment types | `packages/core/src` | React state and adapter-specific schemas |
| A component, config dial, port, or default | `packages/component-catalog/src` | Challenge-slug branches and UI-only rules |
| Level content or a challenge rule | `packages/challenges/src/levels/*.level.json`, then compile/validation | Simulator slug branches and duplicated TypeScript challenge bodies |
| Traffic, capacity, latency, cost, requirements, or experiment outcome | `packages/simulator/src` | Browser-only calculations |
| Agent behavior or tool input/output | `packages/agent-capabilities/src` | WebMCP-only domain implementations |
| Browser tool registration or visual intent | `packages/webmcp/src` | A second capability registry |
| Canvas, map, playback, or annotation rendering | `apps/web/features` | Canonical domain semantics |
| Official attempt, API, or persistence behavior | `apps/web/lib`, `apps/web/app/api`, `supabase/migrations` | Client-trusted scoring |

## Verification

Use real package scripts; do not invent command names from old plans.

- Contract/package change: `pnpm --filter @faultline/<package> verify`
- Cross-package type boundary: `pnpm typecheck`
- Simulator semantics: `pnpm --filter @faultline/simulator verify`
- Level Profile/curriculum change: `pnpm verify:level-profiles`
- Affinity behavior: `pnpm verify:affinity`
- Agent capability change: `pnpm --filter @faultline/agent-capabilities verify`
- WebMCP adapter change: `pnpm --filter @faultline/webmcp verify`
- Web feature: run the matching `apps/web` `verify:*` script, then `pnpm build`
  when the change crosses into application production code.

Formal checks are executable documentation. Extend the narrow verifier when a
new public behavior or a regression-prone invariant is introduced.

## Change safety

- Do not discard or rewrite unrelated worktree changes.
- Do not use destructive Git commands unless the user explicitly requests them.
- Add database changes as a new migration; do not edit an applied migration or
  use a hosted dashboard as schema source of truth.
- Do not expose server-only environment values to browser code.
- Keep browser-only modules free of Node-only imports. In particular, the
  challenge package's filesystem loader is intentionally not exported from its
  browser-safe package root.
- Avoid broad refactors, new infrastructure, and speculative features. Build
  the requested vertical slice and preserve existing playable flows.
