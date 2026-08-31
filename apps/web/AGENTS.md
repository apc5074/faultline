# Web application guide

`@faultline/web` is the Next.js product host. It owns routes, browser
interaction, presentation state, authenticated HTTP boundaries, and adapters to
the shared domain packages. It does not own a second architecture model,
component catalog, simulator formula, agent capability registry, or competition
scoring rule.

Start with the root [`AGENTS.md`](../../AGENTS.md) and
[`docs/CODEX.md`](../../docs/CODEX.md). This guide maps the web implementation
as it exists now; source, route handlers, and scripts are the factual contract.

## Runtime boundaries

```text
browser canvas ── edits canonical Architecture ──> local simulator feedback
       │                  │                              │
       │                  └── UI/view/session state ─────┴──> presentation only
       │
       ├── current architecture + challenge ──> live agent context / WebMCP
       │
       └── official submit ──> authenticated route ──> trusted attempt/snapshot
                                                    └──> server simulator + persistence
```

Local simulation is deliberately fast player feedback. Official results exist
only after the server validates the submitted architecture, loads the
attempt-bound trusted challenge version, re-runs the shared simulator, and
persists the verified projection. Never promote a browser metric, local run,
timestamp, identity, cost, or pass/fail decision to official truth.

## Routes and ownership

| Concern | Begin with | Important boundary |
| --- | --- | --- |
| Page shell and global styling | `app/layout.tsx`, `app/globals.css` | Keep global providers and document metadata small; browser-only behavior belongs in client features. |
| Main product entry | `app/level/1/page.tsx` → `features/architecture-canvas/ArchitectureCanvas.tsx` | The Level 1 route hosts the interactive workspace. |
| Editable board and local run lifecycle | `features/architecture-canvas/usePlaygroundWorkspace.ts` | Canonical editable `Architecture` is separate from selection, playback, view mode, annotations, and stale-result presentation. |
| Canvas rendering and component UI | `features/architecture-canvas/`, `features/playground-glyphs/` | Render catalog/domain data; do not make a UI-only component semantic. |
| Map, packet playback, and run visualization | `features/world-map/`, `features/traffic-playback/` | Consume simulator routes/events/evidence; do not reconstruct traffic or geographic latency. |
| Live agent context | `lib/agent-context/create-agent-context.ts`, `features/agent-context/` | Build fresh context from current canonical architecture, challenge, catalog, and simulator result. |
| Agent session / visual intents | `features/agent-session/`, `features/agent-annotations/` | Session marks are presentation state, not architecture edits or evidence. |
| Browser WebMCP adaptation | `features/webmcp/WebMcpRegistration.tsx` | Register shared resolver-selected tools; failures are contained and gameplay remains usable. |
| Official attempt and submission UI | `features/official-attempt/` | UI sends architecture and attempt/version identifiers only; it displays server responses. |
| Official verification | `lib/competition/verify-submission.ts`, `app/api/submissions/route.ts` | Route uses authenticated attempt context and trusted challenge snapshot, never client claims. |
| Auth, account, rankings, shares | `lib/auth/`, `lib/account/`, `lib/leaderboards/`, `lib/share/` and matching `app/api/**` routes | Validate request input and enforce user ownership in server-side helpers/RPCs. |
| Supabase clients and auth refresh | `lib/supabase/`, `proxy.ts` | Browser uses public config; server/service clients remain server-only. |

Current public pages include `/`, `/level/1`, `/account`, `/s/[shareId]`,
`/webmcp`, and developer-facing `/dev/webmcp` and `/glyph-sheet`. API routes
live under `app/api`; treat each route handler as an untrusted-input boundary.

## Client, server, and data safety

- Add `"use client"` only to a component/hook that needs browser state, effects,
  React Flow, or DOM APIs. Keep server routes and `lib/supabase/server.ts` /
  `service.ts` free of client imports.
- `@/` maps to `apps/web`. Use it for internal imports; shared domain behavior
  comes from `@faultline/*` package exports, not copied into `features/`.
- Only `NEXT_PUBLIC_*` configuration is browser-visible. The service-role
  client is for privileged server work and must never reach a client component
  or serialized response.
- `proxy.ts` refreshes auth for account, Level 1, API, and OAuth paths. It does
  not gate gameplay; unauthenticated visitors are allowed through.
- Route handlers should parse and bound request input, authenticate when needed,
  obtain trusted server-side counterparts, and return explicit response shapes.
  Do not trust browser user IDs, timestamps, challenge config, or submitted
  simulator results.
- Add schema/RLS/RPC changes as a new `supabase/migrations` migration. The web
  app consumes that persisted contract; it is not the schema source of truth.

## Architecture workspace rules

`usePlaygroundWorkspace` is the integration point for the editable graph,
local `evaluateRequirements` calls, React Flow projection, region placement,
playback, official attempts, and stale-state transitions. Preserve these rules:

- `Architecture` is the edit state. Node selection, connecting hints, camera,
  logical/world view, pins, annotations, playback, and attention effects are
  not simulator or official-submission input.
- The active challenge controls palette filtering and evaluation input. Obtain
  placeable component definitions from `componentRegistry`, not handwritten
  lists in UI code.
- Results are stale once the architecture no longer matches the run key. A
  previous result may remain visible as stale evidence but must not silently
  label the edited design as current.
- Canvas/map/playback are consumers of the same canonical architecture and
  simulator output. Use simulator events for traffic animation and geographic
  routes for the world map.
- Experimental output is temporary presentation evidence. It does not rewrite
  the architecture or replace a verified official result.

## Agents and WebMCP

`createAgentContext` produces a fresh immutable, simulator-grounded context on
each live agent read. It uses the shared `architectureEvidenceFingerprint`,
records simulator provenance, and represents simulation validation failure as
unavailable evidence rather than fabricated metrics.

`WebMcpRegistration` creates the default shared registry and registers groups
through `@faultline/webmcp`. Stable review/visual surfaces use a stable key;
specialists and experiments reconcile when the architecture availability key
changes. Visual and experiment callbacks only apply host-owned presentation
effects. Do not put tool business logic, capability schemas, or availability
rules in this component.

WebMCP is optional. Feature flags, unsupported browsers, registration failure,
or partial registration must leave the Level 1 design/simulation flow working.

## Official competition flow

```text
Start Official Attempt
  → server ensures auth/profile and binds an attempt to active daily snapshot
  → browser sends attempt ID, requested version, and Architecture
  → submissions route checks body/auth/attempt/version/limit
  → verifySubmission validates + re-simulates against trusted snapshot
  → persistence writes verified submission and eligible ranking projection
```

Start at `app/api/attempts/start/route.ts` and
`app/api/submissions/route.ts` for changes to this flow. `verifySubmission`
accepts a `TrustedChallengeSnapshot`; changing competition semantics requires
reviewing challenge publishing, simulator version compatibility, persistence,
response contracts, and all competition verification scripts together.

## Change routing

| If you need to change… | Start here | Do not do this |
| --- | --- | --- |
| Graph editing, inspector config, node/edge presentation | `features/architecture-canvas/` | Add a parallel Architecture shape or validate only in React. |
| A component glyph or visual state | `features/playground-glyphs/` | Put capacity/cost/port semantics in the glyph. |
| Playback, map, or geographic visual | `features/traffic-playback/` or `features/world-map/` | Recompute routes, rates, or latency outside simulator evidence. |
| Agent evidence / an embedded-agent concern | `lib/agent-context/`, `features/agent-session/` | Implement a new semantic capability in the web app. |
| Browser agent registration | `features/webmcp/` | Duplicate `@faultline/agent-capabilities` or `@faultline/webmcp` logic. |
| API behavior | matching `app/api/**/route.ts` then `lib/**` | Let a client-provided identity/config/result become authoritative. |
| Auth/Supabase behavior | `lib/supabase/`, `lib/auth/`, `proxy.ts` | Import service credentials into a client module. |
| Scoreboards, account records, share cards | matching `lib/` and route | Bypass database access/RLS contracts with client state. |

## Verification

Read `apps/web/package.json` before selecting a focused verifier. For a web
change, begin with the closest `verify:*` command, then broaden only as the
changed boundary requires:

```sh
pnpm --filter @faultline/web typecheck
pnpm --filter @faultline/web build
```

High-value focused commands include:

```sh
pnpm --filter @faultline/web verify:level1-starter
pnpm --filter @faultline/web verify:presentation-playback
pnpm --filter @faultline/web verify:geo-world-map
pnpm --filter @faultline/web verify:live-agent-context-factory
pnpm --filter @faultline/web verify:agent-session
pnpm --filter @faultline/web verify:submission
pnpm --filter @faultline/web verify:competition-config
pnpm --filter @faultline/web verify:leaderboards
pnpm --filter @faultline/web verify:security-headers
```

For shared capability/WebMCP changes, also run the owning package verifier;
for broader agent-context integration use `pnpm verify:agent-context`. For
official competition or persistence work, use the relevant web verification and
`pnpm verify:phase-4` when the full competition flow is affected.

Before handoff, run `git diff --check`, inspect the diff, and confirm that the
design remains playable when Supabase is unavailable or WebMCP is disabled.
