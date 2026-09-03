# Production

The Vercel project deploys `apps/web` (Root Directory). Its production branch is `main`; all other Git branches receive Vercel Preview deployments. The project uses the repository workspace: install with `pnpm install` and build with `pnpm build` from `apps/web`. That web `build` script first compiles workspace package `dist/` outputs (`@faultline/core`, `component-catalog`, `challenges`, `simulator`) and then runs `next build`. A bare `next build` on a fresh clone fails because package exports resolve to `dist/`, which is not committed. The Vercel-generated public production and Preview URLs are maintained in the Vercel project rather than committed to the repository.

**Verification — 2026-08-25:** an operator confirmed that the public production deployment renders the Faultline shell and that a distinct Preview deployment works without changing production. Builds run from the connected Git repository.

## Environment contract

`.env.example` is the complete non-secret environment contract. It contains placeholders only. Local development reads the repository-root `.env` through `apps/web/next.config.ts`; the server probe also has a development-only compatibility fallback for a flattened local environment file. Preview and Production values belong in Vercel environment settings. The shell has no environment dependency, so configuration access is intentionally deferred until an integration first needs it.

| Variable | Scope | Required now | Location |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Yes; P0-005 | Local `.env`; Vercel Preview/Production environment settings |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Yes; P0-005 | Local `.env`; Vercel Preview/Production environment settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe | Optional legacy fallback | Local `.env`; Vercel Preview/Production environment settings |
| `NEXT_PUBLIC_FAULTLINE_DEV_EXPERIMENTS` | Browser-safe experiment harness flag | No | Dev/test default on when unset; production defaults off; `false` always hides; `true` opts in on Preview |
| `NEXT_PUBLIC_FAULTLINE_WEBMCP_ENABLED` | Browser-safe registration rollback flag | No | Leave unset/true in Preview and Production to expose WebMCP; set `false` only to disable browser tool registration while preserving gameplay |
| `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN` | Browser-safe browser origin-trial token | Browser/version dependent | Vercel Preview/Production value must match the exact deployed origin; never treat it as a secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | No | Local `.env`; Vercel Preview/Production environment settings |

Only `NEXT_PUBLIC_*` variables may be exposed to browser code. Server-only values must be read by server-side code only and must never be copied into a `NEXT_PUBLIC_*` variable or returned in a response. Legacy or provider-specific variable names are not part of this contract.

## WebMCP release procedure

Use a deployed HTTPS Preview URL for browser WebMCP validation; localhost is not the public integration path. Confirm the host/browser’s current Site tools support and approval flow at release time rather than inferring it from generic browser API availability. A successful test shows **Page tools registered**, lists Faultline under ChatGPT's **Available site tools**, invokes a read tool, records it under **Recently used**, and leaves the game fully playable after closing the agent host. **Page runtime unsupported**, **Partial registration**, **Registration failed**, and **Agent tools disabled** are all non-blocking states with truthful top-bar guidance. Page registration by itself is not a successful host acceptance test.

Set `NEXT_PUBLIC_FAULTLINE_WEBMCP_ENABLED=true` in Preview first. ChatGPT's integrated browser does not require Faultline to provide an origin-trial token. The optional token remains only for browser implementations that explicitly require one; promote it only when it was issued for the exact Production origin, because Preview and Production may require separate values. A registration-only rollback sets the feature flag to `false` and redeploys—do not set `NODE_ENV` manually, since Vercel and Next use it to select development versus production behavior. `/dev/webmcp` is intentionally development-only; regular Level 1 registration remains available in production when enabled.

The page emits the `faultline:webmcp` browser event for allowlisted registration state, tool-family counts, and registration/timeout error class. It carries no prompts, architecture, account, tool input, or tool output. Page navigation aborts the registration generation; opening a new tab starts a new page-local session.

## Supabase migrations and probe

`supabase/migrations/` is the source of truth for schema changes; `supabase/seed/` is for local or non-production seed data. Create a migration with `supabase migration new <descriptive_name>`, test it locally with `supabase db reset`, and commit the generated timestamped SQL file. Do not make schema changes directly in the hosted dashboard after this workflow starts.

To connect a clean checkout to the hosted project, install the current Supabase CLI, run `supabase login`, then run `supabase link --project-ref <project-ref>`. The CLI prompts for the database password; linkage state stays in ignored `supabase/.temp/`. Before applying a remote migration, run `supabase db push --dry-run`; then run `supabase db push`. Never use `supabase db reset --linked` against production, and never use `--include-seed` for production.

`GET /api/health/supabase` is a server-side, table-free reachability probe. It requests Supabase Auth's documented `auth/v1/health` endpoint using `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy anon-key fallback). `next.config.ts` loads the root local environment and passes only these browser-safe values to Next; it does not expose server-only values. The route returns only `online`, `unavailable`, or `misconfigured`; it never returns credentials or provider payloads. The shell does not call this route and remains available when configuration is absent.

Anonymous competition identity uses the same browser-safe Supabase project. Enable **Anonymous Sign-Ins** in the Supabase Auth providers dashboard (or `enable_anonymous_sign_ins = true` for local CLI). `POST /api/attempts/start` is the intentional official-start write path: it ensures an anonymous session + `profiles.alias` (`AdjectiveNounNN`), then idempotently creates the player's `attempts` row for the active daily challenge with database-authored `started_at` (`first_valid_at` starts null). `GET /api/attempts/current` restores that attempt after refresh. `POST /api/submissions` accepts `{ attemptId, challengeVersion, architecture }`, re-simulates with the shared verifier, and commits via `commit_verified_submission` (append-only history; set-once `first_valid_at`; race-safe `daily_best`). Client metrics/cost/pass-fail are ignored. Soft cap: 50 official submissions per attempt. `GET /api/leaderboards/fastest` and `GET /api/leaderboards/cheapest` are public (no auth): they rank the active daily challenge from the same `daily_best` projection via `list_fastest_leaderboard` / `list_cheapest_leaderboard` (independent fields; later cheaper solves do not rewrite locked fastest). Each returns only rank, alias, time, and cost — never user UUIDs or architecture JSON. The sidebar HUD toggles Fastest | Cheapest. `GET /api/leaderboards/me` requires the current competition session and returns fastest/cheapest ranks (or explicit unranked) without UUIDs; the Your rank panel refreshes after verified submission. `POST /api/auth/anonymous` and `GET /api/auth/me` remain available for identity-only flows. Local play never requires auth. Session cookies are refreshed by `apps/web/proxy.ts` via `@supabase/ssr`. Apply `supabase/migrations/20260826145000_profiles.sql`, `supabase/migrations/20260826151000_challenge_versions.sql`, `supabase/migrations/20260826154000_attempts.sql`, `supabase/migrations/20260826160000_submissions.sql`, `supabase/migrations/20260826162000_daily_best.sql`, and `supabase/migrations/20260826164000_fastest_leaderboard.sql`, and `supabase/migrations/20260826165000_cheapest_leaderboard.sql`, and `supabase/migrations/20260826166000_my_leaderboard_ranks.sql` before relying on aliases, official challenges, attempts, verified submissions, ranking projections, or the fastest leaderboard. Seed the URL Shortener competition snapshot with `pnpm --filter @faultline/web seed:daily-challenge` (service role required). `GET /api/challenges/active` returns the server-timed immutable challenge; browsers must not author official competition config, attempt timestamps, or verified metrics. Leaderboards must never derive from unverified browser output. Do not implement email/password or GitHub OAuth in Phase 4. Phase 12 account
identity, linking, history, and streak semantics are defined in
`docs/ACCOUNTS.md`.

### Simulator / challenge republish (competition)

`SIMULATOR_VERSION` (`packages/simulator/src/version.ts`, currently **`"4"`**) is stored on each `challenge_versions.simulator_version` row. Official verify rejects a runtime mismatch against the active published snapshot.

When competition semantics change (including workload affinity ceilings, participation/cost pressure rules, or hot-key `reuseConcentration`):

1. Bump `SIMULATOR_VERSION` and/or challenge `version` as appropriate.
2. Update `docs/SIMULATOR.md` version notes.
3. Republish with `pnpm --filter @faultline/web seed:daily-challenge` after deploy.
4. Confirm `pnpm verify:affinity` and `pnpm --filter @faultline/web verify:competition-config` (or submission verify) against the new pair.

Do not silently re-score historical official attempts under incompatible simulator semantics.

To flip a test environment to another registered daily challenge after deploy,
publish/reuse its immutable snapshot and replace the active window in one
operation: `pnpm --filter @faultline/web seed:daily-challenge -- --slug
premiere-night --end-active`. The same command with `--slug url-shortener
--end-active` flips back; the default slug remains `url-shortener` for legacy
local usage.

Direct `profiles` reads are owner-only; public aliases are returned solely by the shaped leaderboard RPCs. Apply `20260826168000_lock_down_profiles.sql` after the existing Phase 4 migrations.

Direct challenge table reads expose only the challenge active under the database clock; historical snapshots remain available only to trusted server verification. Apply `20260826169000_limit_challenge_visibility.sql` after the existing Phase 4 migrations.

AI requests are atomically limited by both the HTTP-only guest cookie and a keyed opaque network identifier derived from Vercel's trusted client-IP header; neither raw IP addresses nor prompt text are stored. Reservations are consumed even when a stream disconnects. Apply `20260826170000_harden_agent_usage_limits.sql` after the existing Phase 4 migrations.

The official submission cap is enforced inside the database insert path under an attempt-row lock, so concurrent requests cannot bypass it. Apply `20260826171000_enforce_submission_limit.sql` after the existing Phase 4 migrations.

Every app response carries a baseline Content Security Policy plus anti-framing, MIME-sniffing, strict-referrer, browser-permission, and HTTPS-transport headers. The policy allows only the configured Supabase browser connection in addition to same-origin application resources.

**Verification — 2026-08-25:** local `GET /api/health/supabase` returned `online` against the hosted project. Configure the same browser-safe values in Vercel Preview and Production before invoking the deployed probe.

Supabase provides Postgres for competition identity and persistence. Official submissions are re-simulated server-side before they can be ranked. External agents connect through the browser's WebMCP implementation; the app does not embed or call a model gateway.

For local competition testing, `pnpm --filter @faultline/web reset:all-runs`
performs a dry run for the GitHub-linked operator account `@apc5074`. Add
`-- --confirm` to remove that user's persisted attempts, submissions,
leaderboard projections, and related share cards across all daily challenges.
The account, profile alias, agent usage, and other users' data are preserved.

## Phase 1 vertical-slice verification

**Verification — 2026-08-25:** `pnpm verify:phase-1` and `pnpm build` succeeded for the Tiny API vertical slice (canonical architecture, simulation outcomes, package boundaries). Vercel production gameplay (PHASE-1-VERIFY V14) still requires pushing the current `main` (ahead of `origin/main`) and an operator pass of the Build → Run → Fail → Modify → Run → Pass loop on the deployed site.


- Production: Vercel deployment from `main`, operator verified (revision `0ef08d7`).
- Preview: verified.
- Supabase: verified.
- WebMCP spike: verified in Chrome 150 with WebMCP testing enabled.
