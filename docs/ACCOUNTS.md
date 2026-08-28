# Accounts — identity and linking contract

Phase 12 adds durable player identity as a **progressive enhancement** to the
existing anonymous competition product. This document is the source of truth for
identity lifecycle, data ownership, linking semantics, and planned API surface
before OAuth or account UI ships.

Related: `docs/PRODUCTION.md` (deployment/env), `plans/phase 12/plan.md`
(ticket order).

## Principles

- Local play, embedded AI, WebMCP, public leaderboards, and official competition
  remain usable **without** a permanent account.
- GitHub is an identity provider only. Supabase Auth owns identity; the
  simulator and server verification own official results.
- The browser never supplies `user_id`, alias, completion claims, streak counts,
  or history rows for authoritative writes.
- Aliases are generated once (`AdjectiveNounNN`), never derived from GitHub
  names, email, or UUIDs, and remain stable across linking.
- Account/auth failures degrade to anonymous play with a clear, non-secret
  message.

## Identity states

| State | Detection | Competition data |
| --- | --- | --- |
| **No session (guest)** | No Supabase auth cookies / `getCurrentAuthUser()` → null | None; local play OK; official start creates anonymous session |
| **Anonymous session** | `user.is_anonymous === true` | `profiles`, `attempts`, `submissions`, `daily_best` keyed to `auth.users.id` |
| **Permanent (linked)** | `user.is_anonymous === false` and GitHub identity present | Same `auth.users.id` and rows as anonymous predecessor when linking succeeded |
| **Returning linked user** | Fresh sign-in to existing permanent user | Rows owned by that user's `auth.users.id`; alias unchanged |

Typed contracts live in `apps/web/lib/auth/account-status.ts` (`AccountStatus`,
`AuthMeResponse`, `LinkingState`, callback redirect allowlist).

## Data ownership

All competition tables foreign-key `user_id → auth.users(id) ON DELETE CASCADE`.

| Resource | Owner key | Notes |
| --- | --- | --- |
| `profiles` | `user_id` (PK) | One alias per auth user; owner-only SELECT; no UPDATE policy |
| `attempts` | `user_id` | `UNIQUE(user_id, daily_challenge_id)`; service-role writes |
| `submissions` | `user_id` | Must match parent attempt; immutable; service-role writes via RPC |
| `daily_best` | `user_id` | Ranking projection; service-role writes via `commit_verified_submission` |
| **History** (PROFILE-001) | `user_id` | Query/projection over verified `submissions` + `daily_best`; no duplicate truth |
| **Streak** (STREAK-001) | `user_id` | Recomputed from eligible verified completions; no client counter |

After linking, **one** `auth.users.id` owns each row. Retries must not create a
second public player or duplicate alias.

## Linking approach (decision)

**Primary: Supabase native anonymous identity linking** (`linkIdentity` with
`provider: 'github'` while an anonymous session is active).

Rationale:

- All competition FKs already point at `auth.users.id`.
- Supabase converts anonymous → permanent **in place**, preserving UUID.
- No row migration, no client-supplied destination user ID, alias and
  leaderboard rank remain stable.
- RLS policies (`auth.uid() = user_id`) continue to work unchanged.

**Fallback (AUTH-004 only if native linking fails in the configured project):**
server-side merge transaction under service role:

1. Lock anonymous and target users.
2. Reassign `profiles`, `attempts`, `submissions`, `daily_best` from anonymous
   UUID → permanent UUID with ownership checks.
3. Idempotency key on link attempt; never merge two permanent users.
4. Audit result server-side; browser receives only success/conflict/error.

Native linking is preferred; implement fallback only after a failed operator
smoke test documents the gap.

## Canonical identity transition

```text
anonymous session (cookies)
  → player taps explicit "Sign in with GitHub"
  → server/browser starts OAuth with opaque state (PKCE where provided)
  → GitHub callback → /auth/callback
  → exchange code; verify session + state
  → linkIdentity once (idempotent)
  → same auth.users.id, same alias, same attempts/submissions/daily_best
  → redirect to allowlisted same-origin path
```

Sign-out (AUTH-004): clear permanent session cookies; do **not** auto-mint a new
anonymous user until the player starts official play again.

## Scenario matrix

### No anonymous session

- Guest can play locally without auth.
- Official competition: `POST /api/attempts/start` creates anonymous session +
  profile + attempt.
- Sign-in CTA starts OAuth; if player had no prior data, linking creates
  permanent user with new profile alias (same as today's anonymous path).

### Anonymous session with competition data

- Linking preserves alias, current attempt, submissions, `daily_best`, leaderboard
  rank, and streak eligibility.
- Callback retry is harmless (already-linked state).
- Player can continue anonymous play if linking fails or is cancelled.

### Already-linked permanent session

- `GET /api/auth/me` returns `isAnonymous: false`, `provider: "github"`.
- No duplicate profile; `ensureProfileForUser` no-ops when alias exists.
- History and streak queries use session-derived `auth.uid()`.

### Different GitHub account on callback

- If GitHub identity is already bound to **another** Faultline user: **do not
  merge**. Surface `identity_conflict`; retain anonymous session until explicit
  player choice (sign out of GitHub / cancel / contact support copy).
- Never expose the other user's alias, UUID, or rows.

### Automatic linking unsupported or partial failure

- Abort link; keep anonymous session and data intact.
- Log server-side; UI shows actionable `link_failed` message.
- Do not delete anonymous user or competition rows.

### Callback replay

- Code exchange is single-use; replay returns `invalid_callback` or
  `expired_code` without mutating data.
- Already-completed link returns success with current permanent status.

### Browser loses cookies mid-flow

- OAuth state mismatch → safe error; player restarts sign-in.
- If anonymous cookies remain, competition data is still on the anonymous UUID.
- If all cookies lost, player gets a new anonymous identity (prior anonymous data
  orphaned — same as today); copy should warn before linking on a fresh device.

## UTC challenge day, history, and streak

**Challenge day** is defined by `daily_challenges.starts_at` / `ends_at`
(`timestamptz`, database `now()`). Active challenge selection matches
`getActiveDailyChallenge()`:

```sql
starts_at <= now() AND ends_at > now()
```

- Do **not** use browser local timezone for official day boundaries.
- **Completion (streak eligibility):** one server-verified, passing,
  under-budget official submission for the active challenge day, committed via
  `commit_verified_submission` with `p_all_requirements_pass` and
  `p_within_budget` true. Ineligible submissions are stored but do not count.
- **Streak:** recompute from eligible completions ordered by challenge day
  (UTC). At most one increment per UTC challenge day; missed day breaks current
  streak; duplicate same-day submissions do not double-count.
- **History (PROFILE-001):** newest challenge day first; fields include challenge
  slug/version, verified status, solve time, monthly cost, requirement summary,
  submitted timestamp. No raw architecture JSON, internal UUIDs, email, or
  provider tokens.
- **Ties / version changes:** history references the `challenge_version_id` stored
  on submission rows; republished challenges do not rewrite past verified rows.

## Privacy and public surfaces

| Surface | Exposes | Must not expose |
| --- | --- | --- |
| Leaderboards (`list_*_leaderboard`) | rank, alias, time, cost | `user_id`, email, architecture |
| `GET /api/auth/me` | alias, anonymous flag, provider kind | email, tokens, raw OAuth |
| History (authenticated) | own verified outcomes | other users' rows, UUIDs |
| Streak HUD | counts and day state | ranking implication |

Direct `profiles` SELECT is owner-only (`20260826168000_lock_down_profiles.sql`).

## Account deletion and retention (Phase 12)

- No in-product account deletion in Phase 12.
- `ON DELETE CASCADE` from `auth.users` removes owned competition rows if an
  operator deletes a user in Supabase Auth.
- Orphaned anonymous users (abandoned sessions) are retained; no automatic purge
  in this phase.

## Agent and simulator boundaries

Account status does **not** change:

- Agent capability availability or schemas
- Simulator inputs, versions, or pass/fail authority
- Architecture validation or official submission verification

Embedded AI and WebMCP remain available without permanent authentication (subject
to existing AI limits and feature flags).

## Session and cookies

| Mechanism | Role |
| --- | --- |
| Supabase SSR auth cookies | Session persistence; refreshed by `apps/web/proxy.ts` |
| `faultline_guest_id` | AI usage limits only; orthogonal to competition identity |

Proxy calls `supabase.auth.getUser()` on navigation; it does not gate routes.
Server Components that cannot set cookies rely on proxy refresh.

## RLS and RPC inventory (current)

### Row-level security

| Table | Player read | Player write |
| --- | --- | --- |
| `profiles` | own row | insert own row only |
| `attempts` | own rows | none (service role) |
| `submissions` | own rows | none (service role + RPC) |
| `daily_best` | own rows | none (service role + RPC) |

### RPC execute grants

| Function | `anon` | `authenticated` | `service_role` |
| --- | --- | --- | --- |
| `commit_verified_submission` | — | — | yes |
| `list_fastest_leaderboard` | yes | yes | yes |
| `list_cheapest_leaderboard` | yes | yes | yes |
| `get_my_leaderboard_ranks` | — | yes | yes |

Linking via preserved UUID requires **no RLS migration**. Fallback merge requires
a new migration updating `user_id` columns with constraints preserved.

## Redirect allowlist

OAuth callback continuation (`next` query param) must normalize to:

- `/`
- `/play`
- `/account`

Any other path falls back to `/`. No off-site or protocol-relative redirects.
Implemented in `isAuthCallbackRedirectAllowed` /
`normalizeAuthCallbackRedirect`.

## Environment and dashboard configuration

| Requirement | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env` / Vercel |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env` / Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | server only |
| Anonymous sign-ins enabled | Supabase Auth dashboard / local `config.toml` |
| GitHub OAuth app + provider enabled | Supabase Auth dashboard (client secret **not** in repo) |
| Redirect URLs | Supabase Auth URL config: `{origin}/auth/callback` for local, Preview, Production |

No new browser-exposed secrets for Phase 12. GitHub client credentials live in
Supabase provider settings only.

## Planned API routes (AUTH-003 / AUTH-004)

| Route | Purpose |
| --- | --- |
| `GET /api/auth/me` | Session snapshot (exists; extend with provider/linking) |
| `GET /api/auth/github` | Explicit GitHub OAuth start (redirect to provider) |
| `POST /api/auth/anonymous` | Identity-only anonymous ensure (exists) |
| `GET /auth/callback` | OAuth code exchange + link verification + profile ensure + redirect |
| `POST /api/auth/sign-out` | Clear permanent session (no auto-anonymous) |
| `POST /api/auth/sign-out` | Clear permanent session |
| `GET /api/account/history` | Verified play history (PROFILE-001) — implemented |
| `GET /api/account/streak` | Recomputed streak (STREAK-001) |

## Planned migrations (not yet applied)

| Migration (planned name) | Purpose |
| --- | --- |
| `*_account_link_audit` (optional) | Idempotency / conflict audit if fallback merge needed |
| `*_player_history_rpc` (optional) | Implemented as `list_player_history` / `count_player_history` |
| `*_account_rls_review` | Only if fallback merge or new tables require policy updates |

No schema change is required for native `linkIdentity` success path.

## Feature flags

Phase 12 does not gate core play behind a feature flag. Account UI may respect
`NEXT_PUBLIC_FAULTLINE_AI_ENABLED`-style patterns only if needed for staged
rollout; default is visible when auth is configured.

## Verification baseline (ACCT-001)

Before changing schema or routes for AUTH-003:

```text
pnpm --filter @faultline/web verify:alias
pnpm --filter @faultline/web verify:profile-privacy
pnpm --filter @faultline/web verify:submission
pnpm --filter @faultline/web verify:my-rank
pnpm --filter @faultline/web verify:security-headers
pnpm typecheck
pnpm build
```
