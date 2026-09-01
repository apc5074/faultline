# Product

Faultline is a daily distributed-systems design game. A player designs an
architecture, runs the shared deterministic simulator, interprets the resulting
evidence, and iterates. The product teaches through outcome-driven tradeoffs;
it does not prescribe a single diagram or let an AI agent build the design for
the player.

## Current player experience

The web application currently exposes these player-facing surfaces:

| Surface | Route | What it does |
| --- | --- | --- |
| Home | `/` | Explains the game, links to Level 1, and shows the active challenge leaderboard. |
| Level 1 | `/level/1` | Interactive architecture canvas with logical/world views, simulator-run evidence, component inspection, and official-attempt UI. |
| Account | `/account` | Authentication controls plus verified play history and streak views. |
| Shared result | `/s/[shareId]` | Public, server-verified result card; it intentionally omits the architecture. |

`/level/1` currently uses the `urlShortenerChallenge` and its Level Profile
starter architecture. Other challenge exports may exist for package-level
verification or authoring, but an exported challenge is not automatically a
playable route.

## Player loop

```text
read briefing → edit canonical architecture → run simulator → inspect evidence
     ↑                                                        ↓
     └────────────────────── iterate on the player's design ─┘
```

The player may add, configure, connect, and regionally place the components
allowed by the current challenge. A run produces simulator-owned traffic,
capacity, latency, cost, requirement, path, and event evidence. The canvas,
world map, and playback present that evidence; they do not determine it.

The product keeps a previous run visible after an edit only as stale evidence.
It must never be presented as the result of the changed architecture.

## Agent collaboration

When a compatible host is available, an agent can inspect the live design,
surface grounded findings, add removable visual annotations, and conduct the
structured design interview. The agent cannot edit the player's canonical
architecture, submit an official attempt, or create leaderboard state.

WebMCP availability is progressive enhancement. The core design-and-simulate
loop remains available when browser agent tooling is unavailable or disabled.

## Competition and identity

Local simulation is available independently of an official attempt. Official
competition uses authenticated attempts and a server-side verification path:
the server binds the attempt to a trusted challenge snapshot, re-simulates the
submitted architecture, and persists only verified results. Leaderboards and
shared cards present the resulting public fields, not private architecture
data.

Authentication supports anonymous play identity and account-linked product
surfaces. It must not become a prerequisite for basic local design and
simulation.

## Product boundaries

- The simulator owns correctness, cost, metrics, requirements, and official
  eligibility; an LLM, UI interpretation, or browser payload does not.
- Challenge difficulty comes from workload, constraints, and outcomes. Do not
  implement named-component or canonical-topology scoring.
- The component catalog defines the available building blocks. New components
  require a current challenge/product need and a complete vertical slice across
  catalog, simulator, challenge allowance, and UI consumers.
- Educational numbers are deterministic product-model assumptions, not cloud
  provider pricing, real outage reports, or external monitoring data.
- Interview simulation scenarios are temporary evaluations. They do not mutate
  player architecture or official results.

## Where to find implementation truth

| Question | Source |
| --- | --- |
| Current route and UI composition | `apps/web/app` and `apps/web/features` |
| Active playground challenge | `apps/web/features/architecture-canvas/playground-challenge.ts` |
| Challenge/Level Profile contract | `packages/challenges` |
| Architecture, simulation, and cost semantics | `packages/core`, `packages/simulator`, and their focused docs |
| Agent/WebMCP behavior | `packages/agent-capabilities`, `packages/webmcp`, and `docs/AI.md` / `docs/WEBMCP.md` |
| Official attempts, leaderboards, and persistence | `apps/web/lib`, `apps/web/app/api`, and `supabase/migrations` |

This document defines the product boundary, not a roadmap. Keep current scope
claims tied to routed behavior and implemented contracts; put future work in a
task or planning artifact instead.
