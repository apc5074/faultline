# API and persistence contract

The Next.js API routes in `apps/web/app/api` are adapters around server
libraries and Supabase. Browser requests are untrusted. The server loads trusted
identity/challenge state, validates inputs, runs shared domain logic where
needed, and uses service-role persistence only for protected writes.

This document covers implemented HTTP and database behavior. It is not an SDK
reference: exact response unions live beside each route and server library.

## Trust boundaries

```text
browser request / cookies
        │ untrusted body, no trusted score or clock
        ▼
Next.js route ──> server library ──> Supabase/RPC
        │               │                 │
        │               └─ trusted challenge + shared simulator
        └─ shaped public response          └─ RLS, constraints, triggers, atomic commit
```

Rules that must remain true:

- The browser supplies an architecture for official submission, never trusted
  metrics, cost, pass/fail, hash, simulator version, challenge configuration,
  user ID, or solve time.
- The server binds an official attempt to a trusted active challenge snapshot,
  validates the architecture, and re-simulates it with the shared catalog and
  simulator before persistence.
- Database time, constraints, locks, and RPCs enforce state transitions that a
  route-only check cannot safely enforce under concurrency.
- Public APIs return deliberately shaped fields. They must not expose user
  UUIDs, raw private architecture JSON, server credentials, or historical/future
  challenge snapshots unless their contract explicitly requires it.

## HTTP surface

All current routes are dynamic. The tables below state access requirements and
the authoritative source; consult the adjacent TypeScript response type before
adding fields or changing an error code.

### Challenge and competition

| Method and route | Access | Behavior |
| --- | --- | --- |
| `GET /api/challenges/active` | Public | Returns the server-selected active daily window and its immutable challenge snapshot/config. |
| `POST /api/attempts/start` | No pre-existing session required | Ensures anonymous Supabase identity and profile alias if necessary, then creates or restores the caller's attempt for the active challenge. Database/server time owns `startedAt`. |
| `GET /api/attempts/current` | Guest or authenticated | Restores the caller's current active attempt or returns an explicit guest/no-attempt/no-active-challenge state. |
| `POST /api/submissions` | Authenticated attempt owner | Accepts `{ attemptId, challengeVersion, architecture }`; binds the attempt, re-simulates against its trusted snapshot, and atomically persists the verified result. |
| `GET /api/leaderboards/fastest` | Public | Returns public aliases and fastest ranking fields for the active challenge's eligible `daily_best` rows. |
| `GET /api/leaderboards/cheapest` | Public | Returns public aliases and cheapest ranking fields for the active challenge's eligible `daily_best` rows. |
| `GET /api/leaderboards/me` | Session-aware | Returns the current player's ranks for the active challenge, or the applicable unranked/guest state. |

`POST /api/submissions` is the only official-score write path. It rejects
oversized/malformed request bodies, unauthenticated callers, mismatched attempt
challenge versions, unsupported architecture, simulator-version mismatch, and
over-limit attempts. Route-level counting is only a fast path; the database
enforces the same 50-submission-per-attempt limit under an attempt-row lock.

### Identity and account data

| Method and route | Access | Behavior |
| --- | --- | --- |
| `POST /api/auth/anonymous` | Public | Ensures an anonymous session and stable alias; it does not create an official attempt. |
| `GET /api/auth/me` | Session-aware | Returns a shaped current-session snapshot. It is safe for guests and reports configuration/auth state rather than requiring sign-in. |
| `GET /api/auth/github` | Session-aware | Starts the GitHub account-linking OAuth flow. |
| `POST /api/auth/sign-out` | Session-aware | Signs out the current session. |
| `GET /api/account/summary` | Session-aware | Returns the account page's combined summary. |
| `GET /api/account/overview` | Session-aware | Returns server-derived completion days and best rank for a permanent account. |
| `GET /api/account/history?limit=&offset=` | Permanent account | Returns paginated, shaped verified history. Guests and anonymous accounts receive an explicit sign-in/account-link state. |
| `GET /api/account/streak` | Permanent account | Returns a server-recomputed streak. Guests and anonymous accounts receive an explicit sign-in/account-link state. |

### Sharing and health

| Method and route | Access | Behavior |
| --- | --- | --- |
| `POST /api/shares` | Authenticated submission owner | Mints or returns an idempotent public card for an owned, verified passing submission. Body: `{ submissionId }`. |
| `GET /api/shares/[shareId]` | Public | Returns only the stored public `ShareCardV1` payload. |
| `GET /api/health/supabase` | Public | Reports only `online`, `unavailable`, or `misconfigured` reachability state; never provider payloads or credentials. |

Share cards are intentionally separate from submissions. A public card contains
server-authored result facts and rank information, never `architecture_json` or
private attempt internals.

## Official submission flow

```text
start/reuse attempt
  → fetch attempt's trusted challenge version
  → structural architecture validation
  → shared simulator requirement evaluation
  → server-computed architecture hash and verified result
  → commit_verified_submission RPC
  → append submission; update first-valid/daily-best only when eligible
```

`verifySubmission` in `apps/web/lib/competition/verify-submission.ts` first
checks the snapshot's simulator version against `SIMULATOR_VERSION`. It then
uses `validateArchitecture` and `evaluateRequirements` with the registered
catalog. A successful verification returns server-derived metrics, cost,
requirements, eligibility, and canonical architecture hash.

The `commit_verified_submission` RPC is atomic. It locks the attempt, computes
official time from database timestamps, appends a submission, sets
`attempts.first_valid_at` once on the first eligible result, and updates the
ranking projection. A request that fails requirements or budget is retained as
an audit submission but never becomes ranking-eligible.

## Persistent model and access

| Object | Purpose | Access model |
| --- | --- | --- |
| `profiles` | Stable public-safe alias for an auth user. | Direct reads are owner-only; public aliases come only from shaped leaderboard RPCs. |
| `challenge_versions` | Immutable `ChallengeDefinition` snapshot, canonical config hash, simulator version. | Only the currently active snapshot is browser-readable through RLS; trusted server paths can read required history. |
| `daily_challenges` | Non-overlapping server-timed window pointing to a challenge version. | Only the currently active window is browser-readable through RLS. |
| `attempts` | One official attempt per user and daily challenge; database-authored start and first-valid timestamps. | Owner reads; protected writes use service-role server flow. |
| `submissions` | Append-only architecture JSON, server hash, verified outcomes, and official timing. | Owner reads; protected writes use the atomic service-role commit RPC. |
| `daily_best` | Per-user/day ranking projection. First eligible result locks fastest; later eligible results may improve cheapest. | Owner direct reads; public rankings come from shaped security-definer RPCs. |
| `share_cards` | Public-safe versioned payload for one passing submission. | No direct client policy; server helpers mint/read it. |
| `account_link_attempts` | Service-only audit of anonymous-to-GitHub linking outcomes. | No client access. |
| `agent_usage_daily` | Service-side daily agent-usage accounting. | RLS enabled; its reservation/completion functions are server-side operational boundaries. |

### Immutable and derived records

- `challenge_versions` rejects updates and protects a version referenced by a
  daily window from deletion. Publish a new version; do not rewrite a snapshot.
- Attempt identity (`user_id`, daily challenge, start time) is immutable.
  `first_valid_at` can change only once from null to a timestamp.
- Submissions reject update/delete. An operator-only reset RPC is the explicit
  exceptional path for removing one user's persisted competition history across
  all daily challenges; it is not normal product behavior.
- `daily_best` is derived exclusively by the atomic commit RPC. Fastest uses
  the first eligible result; cheapest chooses the lowest verified cost and then
  lower solve time on ties.
- History, streak, account overview, and ranking functions are shaped
  security-definer projections. They use `auth.uid()` and return no private
  architecture/UUID fields.

## Database change rules

1. Add a timestamped migration in `supabase/migrations`; never edit an applied
   migration to change production schema behavior.
2. Treat RLS policy, table constraints, triggers, and RPC grants as one
   authorization design. A route check alone is insufficient for privileged or
   concurrent state transitions.
3. For a new public read, return a shaped projection or route response instead
   of making a private base table broadly readable.
4. For a new official write, identify the trusted server-owned equivalents of
   every client field and enforce critical invariants in the database.
5. Keep service-role usage in server-only modules. Do not place service keys in
   browser configuration or return them from a route.
6. Update the route response type, server library, focused verifier, and this
   contract together when a public API or persistence invariant changes.

## Verification

- Official submission and server re-simulation: `pnpm --filter @faultline/web verify:submission`
- Competition configuration/attempt binding: `pnpm --filter @faultline/web verify:competition-config`
- Leaderboards and player rank: `pnpm --filter @faultline/web verify:leaderboards`
  and `pnpm --filter @faultline/web verify:my-rank`
- Account/auth contracts: `pnpm --filter @faultline/web verify:account-contract`,
  `verify:github-oauth`, and `verify:account-linking`
- Broader official flow: `pnpm verify:phase-4`

For migration changes, also test against a local Supabase database before
applying remotely. Inspect the exact migration/RPC path rather than assuming a
route test covers RLS, grants, triggers, or concurrency behavior.
