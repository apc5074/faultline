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
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | No | Local `.env`; Vercel Preview/Production environment settings |
| `AI_GATEWAY_API_KEY` | Server-only | No; P0-006 | Local `.env`; Vercel Preview/Production environment settings |
| `FAULTLINE_AGENT_MODEL` | Server-only | No; P0-006 | Local `.env`; Vercel Preview/Production environment settings |

Only `NEXT_PUBLIC_*` variables may be exposed to browser code. Server-only values must be read by server-side code only and must never be copied into a `NEXT_PUBLIC_*` variable or returned in a response. Legacy or provider-specific variable names are not part of this contract.

## Supabase migrations and probe

`supabase/migrations/` is the source of truth for schema changes; `supabase/seed/` is for local or non-production seed data. Create a migration with `supabase migration new <descriptive_name>`, test it locally with `supabase db reset`, and commit the generated timestamped SQL file. Do not make schema changes directly in the hosted dashboard after this workflow starts.

To connect a clean checkout to the hosted project, install the current Supabase CLI, run `supabase login`, then run `supabase link --project-ref <project-ref>`. The CLI prompts for the database password; linkage state stays in ignored `supabase/.temp/`. Before applying a remote migration, run `supabase db push --dry-run`; then run `supabase db push`. Never use `supabase db reset --linked` against production, and never use `--include-seed` for production.

`GET /api/health/supabase` is a server-side, table-free reachability probe. It requests Supabase Auth's documented `auth/v1/health` endpoint using `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy anon-key fallback). `next.config.ts` loads the root local environment and passes only these browser-safe values to Next; it does not expose server-only values. The route returns only `online`, `unavailable`, or `misconfigured`; it never returns credentials or provider payloads. The shell does not call this route and remains available when configuration is absent.

Anonymous competition identity uses the same browser-safe Supabase project. Enable **Anonymous Sign-Ins** in the Supabase Auth providers dashboard (or `enable_anonymous_sign_ins = true` for local CLI). `POST /api/auth/anonymous` creates an anonymous session only when the player starts an official attempt and persists a unique public `profiles.alias` (`AdjectiveNounNN`). `GET /api/auth/me` returns the current user and alias from cookies. Local play never requires auth. Session cookies are refreshed by `apps/web/proxy.ts` via `@supabase/ssr`. Apply `supabase/migrations/20260826145000_profiles.sql` and `supabase/migrations/20260826151000_challenge_versions.sql` before relying on aliases or official challenges. Seed the URL Shortener competition snapshot with `pnpm --filter @faultline/web seed:daily-challenge` (service role required). `GET /api/challenges/active` returns the server-timed immutable challenge; browsers must not author official competition config. Do not implement email/password or GitHub OAuth in Phase 4.

**Verification — 2026-08-25:** local `GET /api/health/supabase` returned `online` against the hosted project. Configure the same browser-safe values in Vercel Preview and Production before invoking the deployed probe.

Supabase will provide Postgres and Vercel AI Gateway will provide model access through server-only configuration. Official submissions will be re-simulated server-side before they can be ranked.

## AI Gateway probe

`pnpm probe:ai-gateway` is an operator-only server-side verification script. It uses AI Gateway's OpenAI-compatible Chat Completions API to make one tiny request, returns only `online`, `unauthorized`, `unavailable`, or `misconfigured`, and never prints a credential or model response. This script is deliberately not an HTTP route, so it cannot become an unauthenticated billable endpoint.

Set `AI_GATEWAY_API_KEY` and `FAULTLINE_AGENT_MODEL` locally and in Vercel Preview/Production settings. For the Phase 0 connectivity test, use `openai/gpt-5-nano`: it is the current low-cost model ID available through AI Gateway. No chat UI, agent loop, or capability implementation is included.

**Verification — 2026-08-25:** an operator confirmed the local probe succeeds with the authorized Gateway configuration. The script's operator-only execution is the access control for this billable request.

## Phase 1 vertical-slice verification

**Verification — 2026-08-25:** `pnpm verify:phase-1` and `pnpm build` succeeded for the Tiny API vertical slice (canonical architecture, simulation outcomes, package boundaries). `pnpm probe:ai-gateway` returned `online`. Vercel production gameplay (PHASE-1-VERIFY V14) still requires pushing the current `main` (ahead of `origin/main`) and an operator pass of the Build → Run → Fail → Modify → Run → Pass loop on the deployed site.


- Production: Vercel deployment from `main`, operator verified (revision `0ef08d7`).
- Preview: verified.
- Supabase: verified.
- AI Gateway: verified.
- WebMCP spike: verified in Chrome 150 with WebMCP testing enabled.
