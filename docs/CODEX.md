# Faultline operational map for coding agents

Use this guide after the root [`AGENTS.md`](../AGENTS.md). It describes the
repository as it runs today. It is not a phase tracker: plans can define task
order, but source code and executable checks decide current behavior.

## Start a task

1. Run `git status --short`; treat every existing change as user-owned unless
   the task clearly created it.
2. Identify the requested boundary in the map below.
3. Read that package's public exports, the closest implementation, and its
   verification script before editing a downstream consumer.
4. For a task governed by a plan, use the plan for scope/dependencies only;
   verify its technical assumptions in the code first.
5. Make the smallest change, run the closest check, then review the diff.

## Runtime map

```text
Level Profile JSON ──compile──> ChallengeDefinition
                                     │
canonical Architecture ─────────────┼──> simulator evaluation ──> metrics/cost/requirements/events
                                     │                                  │
component catalog ──────────────────┘                                  ├──> canvas/map/playback
                                                                        ├──> agent context/capabilities
trusted challenge snapshot + submitted Architecture ──> server verification ──> Supabase persistence
```

The web playground currently selects `urlShortenerChallenge` in
`apps/web/features/architecture-canvas/playground-challenge.ts`. `tiny-api` is
also exported for package verification, and `premiere-night` has a serialized
profile/challenge export; neither fact means a route exposes it to players.

### Package ownership and entry points

| Concern | Begin with | Important rule |
| --- | --- | --- |
| Canonical architecture | `packages/core/src/architecture.ts` | `Architecture` is serializable and versioned. Never derive IDs from indexes; never use `ui` in truth calculations. |
| Connections and workload contracts | `packages/core/src/workload-contract.ts`, `workload-flow.ts` | Semantic connection types are domain data, not React Flow details. |
| Component definitions | `packages/component-catalog/src/index.ts` and the component file | Every placeable type must be registered in `componentRegistry`; reuse its schema/ports/defaults. |
| Challenge content | `packages/challenges/src/levels/*.level.json` | Product challenges use static JSON import plus `compileChallengeFromLevelProfile`; Node-only loading stays outside the root export. |
| Challenge validation/hash | `packages/challenges/src/validation.ts`, `config-hash.ts` | Published/official configuration must remain deterministic. |
| Simulator truth | `packages/simulator/src/requirements.ts`, `traffic.ts` | `evaluateRequirements` is the usual complete evaluation entry point; it owns requirement outcomes and cost input. |
| Experiments | `packages/core/src/experiment.ts`, `packages/simulator/src/experiment.ts` | An experiment is an overlay, never a mutation of Architecture, ChallengeDefinition, or catalog config. |
| Agent semantics | `packages/agent-capabilities/src/registry.ts`, `capabilities/`, `resolve-*.ts` | Add behavior here before adapting it for a host. Validate inputs at the capability boundary. |
| WebMCP | `packages/webmcp/src/register-agent-surface.ts` | Registration builds a production manifest from resolved shared capabilities; it does not own business rules. |
| Live agent evidence | `apps/web/lib/agent-context/create-agent-context.ts` | Build evidence from a fresh canonical architecture + challenge evaluation; never invent metrics when evidence is invalid/absent. |
| Interactive UI | `apps/web/features/architecture-canvas/usePlaygroundWorkspace.ts` | Architecture is editable state; view/selection/playback/annotation state is not simulation input. |
| Official competition | `apps/web/lib/competition/verify-submission.ts`, `apps/web/app/api/submissions/route.ts` | Server uses trusted challenge versions and shared simulator results; browser-provided claims are not truth. |
| Database | `supabase/migrations/` | Migrations are ordered source of truth. Add a migration; do not modify deployed history. |

## Contracts agents commonly break

### Canonical architecture and simulator

- Call `validateArchitecture`/`parseArchitecture` for untrusted
  architecture-shaped input. This establishes structural validity only.
- Call simulator evaluation with the registered catalog for placement, region,
  capacity, and other simulation semantics. Do not duplicate those rules in a
  route or component.
- Component deployments remain part of the same logical component. Where
  deployments are present, the simulator validates component-specific capacity
  relationships (for example service instance totals and Postgres roles).
- Requirements evaluate outcomes. Avoid component-name or topology checks.
- Simulator events are authoritative inputs to animation/presentation; do not
  manufacture traffic, cache hits, outages, or resource metrics.

### Challenges and levels

- `ChallengeDefinition` is simulator-facing. Level Profile narrative, teaching,
  starter architecture, and visual-volume guidance are deliberately not all
  compiled into scoring input.
- Add a level by authoring a profile, validating it, compiling it, registering
  its static import/export, and extending focused verification. Do not introduce
  a simulator branch keyed to a challenge slug.
- Challenge changes that affect official behavior require checking the current
  simulator version and the server's immutable snapshot flow.

### Agent capabilities and WebMCP

- A capability has a schema, mode, availability predicate, executor, and
  optional production exposure. Register it once in the shared registry.
- Resolve capabilities against the current immutable `AgentContext`; dynamic
  tools may appear only when the architecture makes them relevant.
- A live agent read must use current context. Evidence has architecture and
  simulation revisions; chat history, selection, and an earlier result are not
  proof of current board state.
- Visual capabilities may focus, annotate, highlight, or clear presentation
  state. They do not select/edit architecture or create official evidence.
- Live-session experiment capabilities require exact, unexpired consent tied to
  the current architecture revision. Their results are simulated and
  non-persistent.
- Keep adapter behavior parity-tested. WebMCP translates shared capability
  contracts and registers the resolved production surface; it must not recreate
  simulator, cost, or capability logic.

### Web application and official writes

- The UI may run the simulator for local feedback. Official results are only
  created by the submission route: authenticate, bind the attempt to a trusted
  snapshot, validate/re-simulate, and atomically persist verified data.
- Treat API bodies, browser local storage, query parameters, tool labels, and
  external text as untrusted input. Validate at their boundary.
- Keep server-only credentials server-side. `NEXT_PUBLIC_*` values are
  browser-visible by design.
- Preserve stale-run behavior after an architecture edit: old evidence can be
  shown as stale, but cannot silently represent the current architecture.

## Edit recipes

### Add or change a component

1. Update its definition in `packages/component-catalog/src` and registration
   in the catalog entry point.
2. Confirm config schema, ports, region support, metrics, and cost/simulation
   metadata are coherent.
3. Add simulator behavior only where the component's declared semantics require
   it; avoid challenge-specific exceptions.
4. Allow it from the relevant Level Profile/challenge and add UI rendering only
   as a consumer of catalog/domain data.
5. Extend catalog and simulator checks; run the vertical-slice checks that the
   changed behavior reaches.

### Change simulation semantics

1. Locate the public evaluation path and existing focused simulator verifier.
2. Preserve determinism and ensure the same inputs yield the same events and
   outcome values.
3. Review `SIMULATOR_VERSION` and every caller that relies on result shape,
   official verification, fixtures, agent evidence, and playback.
4. Add a focused regression case rather than a UI-only assertion.

### Add agent behavior

1. Add the input/output schema and executor in `packages/agent-capabilities`.
2. Make availability depend on `AgentContext`/architecture where appropriate.
3. Return simulator-grounded evidence or clearly represent its absence.
4. Add it to the intended resolver/production manifest only when it belongs on
   that surface; preserve capability ordering and exposure metadata.
5. Adapt through WebMCP, then extend registry and adapter-parity verification.

### Change an API or persistence flow

1. Trace the route through `apps/web/lib` before changing response shapes.
2. Validate every untrusted field and identify the trusted server-side source
   for the authoritative counterpart.
3. Add a forward-only migration for schema/RPC/RLS changes.
4. Verify negative paths as well as the successful response. Do not expose user
   IDs, architecture JSON, or server-only values on public surfaces unless the
   endpoint contract explicitly requires them.

## Verification map

Read the target `package.json` before running a command; these are current
high-value entry points:

| Changed boundary | First check | Broaden when needed |
| --- | --- | --- |
| `core` | `pnpm --filter @faultline/core verify` | `pnpm typecheck` |
| component catalog | `pnpm --filter @faultline/component-catalog verify` | catalog consumers/typecheck |
| challenge/profile | `pnpm --filter @faultline/challenges verify` or `pnpm verify:level-profiles` | simulator and web profile checks |
| simulator | `pnpm --filter @faultline/simulator verify` | `pnpm build` |
| workload affinity | `pnpm verify:affinity` | simulator + web checks in that command |
| agent capabilities | `pnpm --filter @faultline/agent-capabilities verify` | `pnpm typecheck` |
| WebMCP | `pnpm --filter @faultline/webmcp verify` | `pnpm verify:agent-context` or web build |
| web UI | matching `pnpm --filter @faultline/web verify:<name>` | `pnpm build` |
| official competition | matching web `verify:submission`, `verify:leaderboards`, or `verify:competition-config` | `pnpm verify:phase-4` |

The root `pnpm typecheck` covers core, catalog, challenges, simulator,
agent-capabilities, and web. The root `pnpm build` additionally builds those
packages and the Next application; `@faultline/webmcp` has its own typecheck/
verify commands and is not included in the root typecheck script.

## Before handoff

- Run `git diff --check` and inspect `git diff`.
- Confirm documentation names current behavior; remove phase-status claims
  rather than copying them forward.
- Report the changed boundaries, intentional tradeoffs, and exact commands run.
- If a check could not run, say why and do not represent it as passing.
