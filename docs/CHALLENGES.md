# Challenges

`packages/challenges` owns configured scenarios, objectives, and constraints. Challenges score outcomes rather than prescribed technologies.

Challenge configuration uses the canonical architecture model and simulator evidence. Daily scheduling and attempts are server-authored; verified submissions are stored append-only with server-computed architecture hashes (`submissions`). Ranking uses the `daily_best` projection (first valid locks fastest; later eligible may improve cheapest), updated only by the service-role `commit_verified_submission` RPC.

## Global URL Shortener

`url-shortener` is Level 1. Workload is exactly 120,000 redirect requests/sec and 4,000 new-link writes/sec (30:1), with a 25% viral-key redirect scenario. Scored requirements are throughput, redirect p95 <150ms, headroom ≥20%, and budget ≤$85,000/month. Availability ≥99.99% is preserved as an unscored target until truthful resilience semantics exist. Geographic origin shares (US East/West, Europe, India, Singapore, Tokyo) are challenge metadata for Phase 3 and must not affect Phase 2 routing or latency. Allowed components include Traffic Source, Global Router, Load Balancer, Service, CDN, Redis, and Postgres (with read replicas as Postgres config).

## Official competition snapshots

`packages/challenges` remains the authored source of challenge definitions. Phase 4 persists immutable snapshots in Supabase `challenge_versions` (`config_json`, deterministic `config_hash`, `simulator_version`) and schedules them with `daily_challenges`. Server time selects the active window via `getActiveDailyChallenge()` / `GET /api/challenges/active`. Do not edit a published version — bump `version` and republish. Seed the current URL Shortener with `pnpm --filter @faultline/web seed:daily-challenge` after applying migrations (requires `SUPABASE_SERVICE_ROLE_KEY`).

## Tiny API

`tiny-api` is a development-only Phase 1 challenge, retained for regression smoke testing. Its configuration supplies 6,000 requests/sec with a 90% read and 10% write split, four outcome requirements (throughput, p95 latency, headroom, and budget), an $8,000/month budget, and exactly the Traffic Source, Stateless Service, and Postgres component types. It does not declare a required topology or a winning configuration; `evaluateRequirements` in the simulator scores those outcomes from capacity, latency, and cost.
