# Challenges

`packages/challenges` owns configured scenarios, objectives, and constraints. Challenges score outcomes rather than prescribed technologies.

Challenge configuration uses the canonical architecture model and simulator evidence. Daily scheduling and attempts are server-authored; verified submissions are stored append-only with server-computed architecture hashes (`submissions`). Ranking uses the `daily_best` projection (first valid locks fastest; later eligible may improve cheapest), updated only by the service-role `commit_verified_submission` RPC. Official verification runs through `apps/web/lib/competition/verify-submission.ts` using the shared simulator — never client metrics.

---

## Level 1 — Global URL Shortener

**Slug:** `url-shortener`  
**Version:** 2 (bump and republish when simulator semantics change)

Level 1 is the flagship daily challenge. It teaches the full Level 1 component sandbox at real scale: global read-heavy traffic, a live viral short link, geographic latency, independent read/write database limits, layered caching, and a hard monthly budget. Winning designs typically use five to seven component types; no single topology is required.

### Scenario

You are the infrastructure lead at **LinkVault**, a global URL shortener. The product worked fine at startup scale (~12k RPS). Marketing just dropped `#MegaDrop2026` — a celebrity campaign link — and traffic jumped overnight.

Your board approved a **$85,000/month** infrastructure envelope. Product requires:

- Every redirect and new-link write must be handled at peak load.
- Redirect **p95 latency under 150 ms** for users worldwide (traffic-weighted across origins).
- At least **20% capacity headroom** on compute and database so the next spike does not instantly saturate the system.
- The viral link must not melt a single cache key or the database primary read path.

There is no prescribed topology. Structure, sizing, and regional placement are the game.

### Starting state (recommended)

Players begin from an **inherited MVP that fails at challenge scale** — not a blank canvas, not a fully built wrong answer.

Default starter architecture:

```text
Traffic Source → Service (medium × 3, us-east) → Postgres (medium, 0 replicas, us-east)
```

No CDN, Redis, Load Balancer, or Global Router. One region, no cache layers, write and read pressure on a single Postgres primary.

On first simulation against challenge workload this starter **fails every scored requirement**:

| Requirement | Why it fails |
|---|---|
| Throughput | ~6k service RPS vs 124k demand |
| Latency | All origins pay cross-region RTT to us-east; no edge offload |
| Headroom | Services and Postgres saturate immediately |
| Hot key | 30k RPS on one viral key overwhelms primary read capacity |
| Budget | N/A until the design handles load |

The player’s job is to **evolve** this MVP: add layers, scale out, place capacity near users, and stay inside budget. Sandbox “Load (our) Answer” remains a dev-only reference, not the player default.

Alternative modes (future product flags):

- **Blank canvas** — for experienced players; same requirements.
- **Broken prod** — same starter but pre-saturated with red metrics and a narrative incident ticket (attack mode companion).

Level 1 default is **inherited MVP** because it gives immediate context, visible failure, and a satisfying before/after arc without prescribing a solution.

### Workload

| Parameter | Value | Notes |
|---|---|---|
| Redirect (read) RPS | **120,000** | Cache-eligible 302 lookups |
| New-link (write) RPS | **4,000** | Always origin + primary DB |
| Combined RPS | **124,000** | 30:1 read:write — classic shortener skew |
| Read ratio | 0.968 | Redirects |
| Write ratio | 0.032 | Creates / updates |
| Viral hot-key fraction | **0.25** | 25% of redirect traffic → **one** short code (**30,000 RPS**) |

**Traffic character**

- **Redirects** — idempotent reads; CDN and Redis can absorb eligible traffic. Misses reach Service → (Redis) → Postgres.
- **Writes** — always miss every cache; always hit origin Service and Postgres **primary** (never replicas).
- **Viral key** — concentrated on a single mapping. Replicas do **not** shard one hot key; Redis hot-key capacity and primary read capacity are the relief valves.
- **Sustained peak** — challenge models worst-case sustained RPS, not a brief burst. Designs must hold, not just survive a spike.

### Geographic traffic origins

Challenge-owned fractions (must sum to 1). Phase 3 activates these via `deriveRegionalWorkload`; nearest-healthy routing applies when Services have regional deployments and a Global Router sits on the request path.

| Region | Share of users | Approx. redirect RPS | Approx. write RPS |
|---|---|---|---|
| us-east | 25% | 30,000 | 1,000 |
| us-west | 20% | 24,000 | 800 |
| europe | 25% | 30,000 | 1,000 |
| india | 10% | 12,000 | 400 |
| singapore | 10% | 12,000 | 400 |
| tokyo | 10% | 12,000 | 400 |

Traffic originates globally; latency scoring is **traffic-weighted p95** across origin paths. A design that only optimizes us-east fails European and APAC users even if total throughput passes.

**Cross-region cost inputs** (`transferPayload` — educational, not measured production bytes):

| Payload | Bytes | Used for |
|---|---|---|
| Redirect response | 800 | Edge/origin response on read path |
| Write request | 1,200 | New-link request body |
| DB read | 1,024 | Cache miss → Postgres read |
| DB write | 512 | Primary write |
| Replication per write | 512 | Primary → each remote replica |

Same-region transfer: **$0/GB**. Cross-region: **$0.02/GB** (flat educational rate).

### Allowed components (Level 1 sandbox)

Level 1 exposes **all seven** Level 1 catalog types. Later levels introduce Queue, Worker, Event Stream (Level 2) and Rate Limiter / flash-traffic primitives (Level 3) — those are intentionally **not** available here so the 20-challenge roadmap can introduce new mechanisms without revisiting Level 1 fundamentals.

| Component | Player levers | Role in this challenge |
|---|---|---|
| **Traffic Source** | label only (challenge-owned) | Injects global workload; not a sizing toy |
| **Global Router** | none (nearest-healthy policy) | Routes each origin to lowest-latency healthy Service deployment |
| **Load Balancer** | `equal` \| `capacity_weighted` | Fans request traffic across multiple Services |
| **Service** | `size`, `instances`, regional deployments | Stateless redirect/write API — sole compute primitive |
| **CDN** | `coverage`, `ttlBand`, `tier` | Edge offload for redirects; writes always miss |
| **Redis** | `mode`, `tier`, `ttlBand`, regional deployments | Read-aside cache on Service → Postgres path |
| **Postgres** | `tier`, `readReplicaCount`, primary/replica regions | Durable link store; reads scale, writes stay on primary |

Typical winning designs use **CDN + Service + Postgres** at minimum; competitive designs add **Redis**, **Load Balancer**, **Global Router**, and **multi-region deployments**. Using every component is optional; using only two or three is insufficient at this scale.

---

### What each component tracks

Simulator metrics are authoritative; the UI renders them, never recomputes them.

#### Traffic Source

- **Tracks:** `outgoing_requests_per_second` (challenge workload egress).
- **Scaling:** none — demand is fixed by the challenge.
- **Cost:** $0.

#### Global Router

- **Tracks:** `incoming_requests_per_second`, `forwarded_requests_per_second`.
- **Scaling:** no player knobs. Policy is fixed **nearest healthy region** when geographic routing is active (Service deployments + challenge geography).
- **Placement rule:** must sit on the request path **before** regional Service pools to affect routing.
- **Cost:** $0/month (Phase 2 educational passthrough).

#### Load Balancer

- **Tracks:** `incoming_requests_per_second`, `forwarded_requests_per_second`.
- **Scaling:** `policy` only.
  - `equal` — even split across downstream Services.
  - `capacity_weighted` — split proportional to each Service’s configured capacity (`instances × size capacity`).
- **Cost:** **$500/month** fixed. Real budget tradeoff vs direct fan-out.

#### Service (Stateless)

- **Tracks:** `incoming_requests_per_second`, `capacity`, `utilization`, `headroom`, `p95_latency`.
- **Scaling:**
  - **`size`** — scale up per instance:

    | Size | Capacity / instance | Cost / instance |
    |---|---|---|
    | small | 1,000 RPS | $500/mo |
    | medium | 2,000 RPS | $1,000/mo |
    | large | 4,000 RPS | $2,000/mo |

  - **`instances`** — scale out (1–10 per logical component; regional deployments must sum to total instances).
  - **Regional deployments** — place instance counts per region; capacity is evaluated **per deployment** so a hot region can saturate while global totals look fine.
- **Latency:** base **20 ms** p95 before utilization pressure; rises through 70% → 90% → 100%+ bands.
- **Headroom:** `(capacity − incoming) / capacity`; negative when overloaded.

#### CDN

- **Tracks:** `incoming_redirect_rps`, `hit_rate`, `hit_rps`, `miss_rps`, `origin_rps`, `utilization`, `capacity`.
- **Scaling:**
  - **`coverage`** (0–1) — fraction of redirect traffic *eligible* for edge cache (not geography).
  - **`ttlBand`** — `short` 55% / `medium` 75% / `long` 88% configured hit rate on eligible traffic.
  - **`tier`** — edge throughput ceiling:

    | Tier | Throughput | Base cost |
    |---|---|---|
    | small | 40,000 RPS | $2,000/mo |
    | medium | 100,000 RPS | $5,000/mo |
    | large | 250,000 RPS | $12,000/mo |

  - **Usage cost:** `incoming_RPS × 2,592,000 / 1,000,000 × $0.05` added to base (sustained 30-day month).
- **Behavior:** absorbs eligible **redirect** hits before origin; **writes always miss**. Effective placement: **`Traffic → CDN → …`** (edge ingress). CDN behind Service gets demoted effectiveness via workload affinity.
- **Does not** reduce Postgres reads directly — only origin redirect RPS.

#### Redis

- **Tracks:** `hit_rate`, `read_throughput`, `miss_throughput`, `utilization`, `capacity`, `hot_key_utilization`, `reads_avoided`.
- **Scaling:**
  - **`mode`** — `standalone` vs `replicated` (local HA: ×1.8 throughput, ×1.5 hot-key capacity, ×2 cost).
  - **`tier`**:

    | Tier | Throughput | Hot-key capacity | Base cost |
    |---|---|---|---|
    | small | 20,000 RPS | 5,000 RPS | $1,500/mo |
    | medium | 50,000 RPS | 12,000 RPS | $3,000/mo |
    | large | 120,000 RPS | 30,000 RPS | $6,000/mo |

  - **`ttlBand`** — same hit-rate bands as CDN (applies to eligible reads after CDN miss).
  - **Regional deployments** — independent per-region cache footprints; **no cross-region sync** (replicated mode is local HA only).
- **Behavior:** read-aside on `Service → Redis → Postgres` (`read_write` edges). **Never absorbs writes.** Hot-key scenario uses **`hotKeyCapacityRps`** separately from aggregate utilization — a single viral key can saturate while average cache utilization looks healthy.
- **Placement rule:** between Service and Postgres on the read path. Misplaced Redis (unreachable from Service read path) scores low via workload affinity.

#### Postgres

- **Tracks:** `read_requests_per_second`, `write_requests_per_second`, separate read/write `utilization`, `effective_utilization` (= max of read, write), `read_capacity`, `write_capacity`, shortfalls, `read_replica_count`, `p95_latency`.
- **Scaling:**
  - **`tier`** — primary read + write ceilings:

    | Tier | Read RPS | Write RPS | Primary cost | Replica cost each |
    |---|---|---|---|---|
    | small | 5,000 | 800 | $2,000/mo | $1,500/mo |
    | medium | 10,000 | 2,000 | $4,000/mo | $3,000/mo |
    | large | 20,000 | 5,000 | $7,000/mo | $5,000/mo |

  - **`readReplicaCount`** (0–8) — adds read capacity; reads split capacity-proportionally across primary + replicas.
  - **Regional deployments** — exactly one **primary** region; replica regions match replica count. Writes **always** land on primary regardless of user region.
- **Hot key:** viral read pressure measured against **primary read capacity only** — replicas help aggregate reads but do not shard one key.
- **Latency:** base **30 ms** p95 before utilization pressure (same curve as Service).
- **Headroom contributor:** requirement headroom uses `min(service headroom, 1 − postgres effective utilization)`.

---

### Workload affinity (placement teaching)

Affinity is how Level 1 teaches **relationships** without scoring technology names.

**Ownership**

| Concern | Owner |
| --- | --- |
| Mechanism ceilings, notes, optional `unitCostPressure` / `processingLatencyPenaltyMs` / `reuseConcentration` | Challenge (`ChallengeDefinition.workloadAffinity`) |
| Catalog type → mechanism id | Simulator (`mechanismIdForCatalogType`) |
| Role from topology | Simulator (`resolveNodeRole`) — pure graph predicates, never `challenge.slug` |
| Player dials (TTL, coverage, size, …) | Component config / catalog |
| Effective benefit on ACTIVE work | Simulator (`effective = challengeCeiling × playerIntent`) |
| Pass/fail | Outcomes only (throughput, latency, headroom, budget, hot-key when active) |

Omitting `workloadAffinity` preserves legacy behavior (mechanism ceiling `1.0`). Role defaults still demote unreachable/misplaced when those roles resolve.

#### Participation contract (ACTIVE / IDLE)

Every instance resolves to one participation state per run:

| State | Meaning | Scoring effect |
| --- | --- | --- |
| **ACTIVE** | On an evaluated path with handled work (`handledRps > 0` or cache hits) | Full effectiveness, usage-cost pressure, latency pressure, busy visuals |
| **IDLE** | Placed but unreachable, or zero handled work for this workload | No benefit, no usage-pressure multiplier, no latency penalty; optional catalog **base** monthly cost still applies |
| **HARMFUL** | ACTIVE with wrong mechanism/role for this challenge | Low effectiveness on handled work; may fail requirements; canvas shows strain |

**Player promise:** an extra Redis under budget that receives **no traffic** is IDLE — the game informs, it does **not** fail you for “bad architecture.” The same Redis on the hot path pretending to be edge cache can absorb poorly and fail latency/budget for visible reasons.

#### Mechanisms vs roles vs request class

- **Mechanism** — *what job* the catalog type can do (`edge_cache`, `data_cache`, `request_fanout`, `geo_routing`, `stateless_compute`, `durable_store`). Independent of where it sits.
- **Role** — *where* this instance sits (`edge_ingress`, `read_aside`, `compute`, `primary_store`, `misplaced`, `unreachable`, …). Derived from request/`read_write` topology.
- **Request class** — challenge workload shape (redirects vs writes, hot-key fraction). Affinity ceilings are authored per mechanism for that class; they are not a tech prescription.

Same dials, different spot → different reward. Same spot, different challenge ceilings → different reward. Same role, different mechanism (future `durable_store` vs `object_store`) → different $ / latency for **this** problem — still no “used Postgres” boolean.

#### Level 1 authored ceilings (`url-shortener` v2)

Authored in `packages/challenges/src/url-shortener.ts`. Approximate teaching targets:

| Mechanism | Catalog type | `maxEffectiveness` | Intended role | Notes |
| --- | --- | --- | --- | --- |
| `edge_cache` | CDN | 0.88 | `edge_ingress` | Strong redirect offload on user path; weak behind Service |
| `data_cache` | Redis | 0.30 | `read_aside` | Helps hot keys beside the store; weak as an edge substitute |
| `request_fanout` | Load Balancer | 0.90 | `path_middleware` | Pays off with multiple healthy upstreams |
| `geo_routing` | Global Router | 0.85 | `geo_route` | Matters when traffic spans regions |
| `stateless_compute` | Service | 1.0 | `compute` | On-path compute |
| `durable_store` | Postgres | 1.0 | `primary_store` / `replica_store` | Terminal row store |

Role defaults demote `unreachable` → 0, `misplaced` → 0.05, `write_path` → 0.1 when `byRole` omits the resolved role.

#### Store competition (row vs future object)

`durable_store` is the Level 1 row-store mechanism (Postgres). Future catalog types (object storage, document store) get **new mechanism ids** (`object_store`, `document_store`) and challenge affinity rows that reuse the same store apply sites. Do **not** branch on `challenge.slug` or invent a second rating system. Same primary role + different mechanism affinity must diverge on capacity / latency / $ for the workload — outcomes only, never “use Postgres not S3” as a scored check.

#### Unit cost / latency pressure authorship

Optional on each mechanism row:

- `unitCostPressure` — multiplies **usage-sensitive** cost for **ACTIVE** handled work only (see `docs/COST_MODEL.md`). Idle nodes keep catalog base cost.
- `processingLatencyPenaltyMs` — additive processing latency when the mechanism serves ACTIVE work in-role.
- `note` — briefing/coaching copy; never scored.

#### Not a tech prescription

Affinity never adds “used Redis / used CDN / used Postgres” requirements. Coaching may cite low effectiveness or high unit-cost pressure from evidence; it must not reveal a canonical topology. Themes include `cache-workload-fit`, `placement-fit`, `mechanism-fit` (plus Level 1 hot-key / read scaling / global latency).

Prohibited coach reveals: canonical topology, mandatory component checklist, solution-only numeric thresholds.

#### Extending affinity (checklist)

When any level adds a catalog type or competing store:

1. Add a `WorkloadMechanismId` union member **if the job is not interchangeable** with an existing mechanism (Postgres vs S3 → different ids; two row DBs → same id).
2. Map catalog type → mechanism in `mechanismIdForCatalogType` (one helper).
3. Add/extend `ArchitecturalRoleId` + `resolveNodeRole` predicates if placement patterns or request classes are new.
4. Author challenge `mechanisms[id]` with `maxEffectiveness`, `byRole`, and optional `unitCostPressure` / `processingLatencyPenaltyMs` / notes for each level that includes the type.
5. One sim apply site family: multiply `effective` into capacity/absorb/latency **and** into emitted path volumes / events; multiply usage $ by `unitCostPressure` for handled work.
6. Evidence + docs line; canvas/glyph consumers pick up new event fields if needed.
7. Verify: good placement vs bad placement, same dials — metrics **and** volume split (`pnpm verify:affinity`).
8. Verify (when competing mechanisms exist): same primary role, different mechanism affinity → different $ / latency / capacity for this workload — still no slug branch.

## Level Profiles

Level Profiles are the **curriculum authoring container** for a playable level. Affinity remains the **physics** (mechanism × role × intent → capacity / absorb / cost / events). Profiles serialize story, sandbox teaching cards, workload/geo/scoring, affinity authorship, starter architecture, volume teaching bands, and playtest checklist so Levels 2–N can reuse one format without a second simulator.

### Paths and compile entrypoints

| Artifact | Path |
| --- | --- |
| Schema + `assertLevelProfile` | `packages/challenges/src/level-profile.ts` |
| Level 1 JSON (“The Viral Moment”) | `packages/challenges/src/levels/url-shortener.level.json` |
| Static registry / load helpers | `packages/challenges/src/get-level-profile.ts`, `levels/index.ts` |
| Compile → `ChallengeDefinition` | `packages/challenges/src/compile-level-profile.ts` |
| Thin challenge export | `packages/challenges/src/url-shortener.ts` (static JSON import + compile) |
| Node/fs loader (scaffold/verify only; **not** in package root export) | `packages/challenges/src/load-level-profile.ts` → import `../dist/load-level-profile.js` from Node scripts |

Prefer **static JSON import + compile at module init** for product challenge exports (Next/Edge-safe). Use `fs` only in Node scripts.

Official competition, simulator, and server re-sim still consume **`ChallengeDefinition` only**. Teaching fields never become pass/fail.

### Ownership split

| Concern | Lives in profile | Compiled into `ChallengeDefinition`? | Who judges truth |
| --- | --- | --- | --- |
| Workload, geo, transfer, requirements, budget, unscored targets | Yes | Yes | Simulator + cost |
| `workloadAffinity` ceilings / notes | Yes | Yes | Simulator affinity apply sites |
| `allowedComponentTypes` (sandbox card types) | Yes | Yes | Validation allowlist only |
| Narrative (hook, stakes, briefingBeats) | Yes | No (`identity.prompt` is the public problem string) | UI / agent framing |
| Component teaching cards (pros/cons/mistakes) | Yes | No | UI inspector / briefing |
| `volumeProfile` bands + rules | Yes | No | Playtest / canvas share mapper guards |
| `starterArchitecture` | Yes | No | Client initial canvas only |
| `playtestChecklist` | Yes | No | Humans (affinity T-11) |

### Volume bands ≠ scoring

`volumeProfile.bands` are **soft teaching ranges** for visuals and playtest (e.g. CDN ≫ Redis on average redirects). They must not be treated as required path shares, topology checks, or scored hit rates. Canvas busyness maps **simulator absorb / path RPS ÷ challenge redirect RPS** (`apps/web/features/traffic-playback/volume-share-visuals.ts`). If shares look wrong after a correct design, calibrate affinity numbers — do not invent client hit rates from profile bands.

### Profiles sit atop the affinity extending checklist

Authoring a new level:

1. Copy / scaffold a `.level.json` (see LP-07 scaffold when present).
2. Fill narrative, sandbox cards, workload/geo/scoring.
3. Author `workloadAffinity` using **Extending affinity** above — never `challenge.slug` branches in the simulator.
4. Set `volumeProfile` teaching bands for playtest (CDN vs data_cache order for URL-shortener-like workloads).
5. Set fail-first `starterArchitecture` + `firstRunExpectation`.
6. Register static import / compile export; run `pnpm verify:level-profiles` and `pnpm verify:affinity`.

### Level 1 — The Viral Moment

Canonical curriculum: `packages/challenges/src/levels/url-shortener.level.json`.

- Hook: inherited LinkVault MVP → `#MegaDrop2026` viral spike at 124k RPS / $85k board.
- Starter: Traffic → Service (medium × 3, us-east) → Postgres (medium) — first Run should fail for capacity reasons.
- Sandbox: seven Level 1 types; out of scope Queue / Worker / Event Stream / Rate Limiter.
- Teaching: Redis is a **viral relief valve**, not the average-redirect main character; CDN owns high average-redirect leverage when correctly placed.

### Playtest handoff (affinity T-11)

`pnpm verify:level-profiles` locks schema, Level 1 profile↔challenge compile parity, inherited MVP starter failure, and share-based CDN≫Redis visuals. **Human playtest (affinity T-11)** remains the exit criterion: confirm the fail-first starter arc (LP-04) and that baseline Run feels CDN-busier than Redis (LP-05) without silencing Redis when it is the only absorber.

---

### Scored requirements

All requirements are evaluated from simulator + cost outcomes. **No component names or topologies are checked.**

| ID | Label | Type | Target | Comparator |
|---|---|---|---|---|
| `throughput` | Throughput | throughput | 1.0 (100% demand handled) | ≥ |
| `latency` | Redirect p95 latency | latency | 150 ms | < |
| `headroom` | Capacity headroom | headroom | 0.20 (20%) | ≥ |
| `budget` | Monthly infrastructure budget | budget | $85,000 | ≤ |

**Throughput** — lowest handled-demand share across Services and Postgres (reads and writes independently for DB). Any sustained shortfall fails.

**Latency** — worst-case redirect path p95 in logical mode; traffic-weighted regional p95 when geography is active. Redis/CDN hits skip downstream network and processing on the miss path. Writes are not latency-scored but still consume write capacity.

**Headroom** — minimum of Service headroom and `(1 − postgres effective utilization)` across the architecture.

**Budget** — `estimateMonthlyCost`: all component line items + CDN usage + cross-region transfer + replication bytes. No hidden fees.

**Hot-key scenario** (implicit gate when `hotKeyReadFraction > 0`) — viral 30k RPS must pass `evaluateHotKeyScenario`: CDN/Redis hot-path capacity and Postgres primary read path must not saturate on the single key. Overall pass requires hot-key pass **in addition to** all four scored requirements.

### Unscored targets (preserved, not lied about)

| ID | Label | Target | Reason |
|---|---|---|---|
| `availability` | Availability | 99.99% | Deferred until truthful failure/failover semantics exist. Shown in briefing; not pass/fail. |

Future attack mode (agent experiment): cache flush, component failure, region failure — players respond with spare capacity, replication, and multi-region structure already built for scale.

---

### Budget rationale

**$85,000/month** is tuned so:

1. **Naive over-provisioning fails** — e.g. max-tier everything in one region exceeds budget once CDN usage and transfer are included.
2. **Layered, regional designs pass** — CDN large + right-sized regional Services + Redis + Postgres with selective replicas + transfer costs land in the **$65k–$84k** band.
3. **Tradeoffs are real** — Load Balancers, replicated Redis, and extra replica regions each cost money; skipping CDN saves base + usage but explodes origin load and latency.

Reference ballpark (not a solution — one valid region):

| Line item | Illustrative range |
|---|---|
| CDN (large + usage @ 124k RPS) | ~$28k–$30k |
| Services (multi-region, mixed sizes) | ~$12k–$24k |
| Redis (1–3 regional footprints) | ~$3k–$18k |
| Postgres (large + 1–3 replicas) | ~$12k–$22k |
| Load balancers / transfer | ~$1k–$8k |

Players who earn the cheapest valid lock on the leaderboard must optimize **cost after meeting SLOs**, not minimize cost alone.

---

### Level 1 bounds (what this challenge is and is not)

**In scope**

- All Level 1 catalog components and regional deployments.
- Read/write asymmetry, layered caches, hot-key concentration, geographic latency and transfer cost.
- Horizontal and vertical scaling; read replica scaling; independent per-region service saturation.
- Outcome scoring only.

**Out of scope (reserved for Levels 2–20)**

- Async ingestion (Queue, Worker, Event Stream).
- Rate limiting and flash-traffic correctness primitives.
- Prescribed “winning topology” or technology mandates.
- Fake HA checkboxes — resilience must come from structure the simulator can evaluate when attack mode ships.

**Difficulty comes from the level, not from hidden rules.** The briefing states workload, geography, budget, and SLOs; the simulator determines truth.

---

### Implementation reference

**Source of truth:** `packages/challenges/src/levels/url-shortener.level.json` (Level Profile), compiled by `compileChallengeFromLevelProfile` into `urlShortenerChallenge`.

Thin export: `packages/challenges/src/url-shortener.ts`.

Key constants (also authored in the profile):

```text
redirectRps = 120_000
writeRps    = 4_000
totalRps    = 124_000
hotKeyReadFraction = 0.25
monthlyBudget = 85_000
p95TargetMs = 150
headroomTarget = 0.20
```

Prompt (player-facing, `identity.prompt`):

> Design infrastructure for a global URL shortening service. It must absorb heavy redirect traffic, accept new links, survive a viral short URL, and stay within latency, capacity headroom, and monthly budget — without a prescribed topology.

---

## Tiny API

`tiny-api` is a development-only Phase 1 challenge, retained for regression smoke testing. Its configuration supplies 6,000 requests/sec with a 90% read and 10% write split, four outcome requirements (throughput, p95 latency, headroom, and budget), an $8,000/month budget, and exactly the Traffic Source, Stateless Service, and Postgres component types. It does not declare a required topology or a winning configuration; `evaluateRequirements` in the simulator scores those outcomes from capacity, latency, and cost.

---

## Official competition snapshots

`packages/challenges` remains the authored source of challenge definitions. Phase 4 persists immutable snapshots in Supabase `challenge_versions` (`config_json`, deterministic `config_hash`, `simulator_version`) and schedules them with `daily_challenges`. Server time selects the active window via `getActiveDailyChallenge()` / `GET /api/challenges/active`. Do not edit a published version — bump `version` and republish. Seed the current URL Shortener with `pnpm --filter @faultline/web seed:daily-challenge` after applying migrations (requires `SUPABASE_SERVICE_ROLE_KEY`).
