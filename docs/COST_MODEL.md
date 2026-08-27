# Cost model

Cost is a deterministic simulation constraint, not presentation-only metadata. The simulator calculates it from canonical architecture state so browser and server agree.

`estimateMonthlyCost` in `@faultline/simulator` returns the shared `CostResult`; the UI must consume it rather than duplicate these rules. Estimates are educational, not cloud-provider pricing.

## Phase 1 components

- Stateless Service: `$1,000` per medium instance (size tiers scale per-instance cost).
- Postgres: `$2,000` / `$4,000` / `$7,000` for small / medium / large primary tiers.
- Traffic Source: no infrastructure cost.

## Phase 2 components

- Redis: tier base cost (`$1,500` / `$3,000` / `$6,000`); replicated mode multiplies cost (and capacity) so redundancy is not free. One combined line item per Redis component.
- Postgres read replicas: `primary tier + readReplicaCount × monthlyCostPerReplica`.
- Load balancer: fixed educational monthly cost.
- Global Router: `$0` in Phase 2 (passthrough).
- CDN: tier base (`$2,000` / `$5,000` / `$12,000`) plus usage priced from sustained incoming RPS when traffic metrics are supplied (see below).

## Monthly projection constant

When usage pricing applies, sustained requests/sec project to a 30-day month:

```text
secondsPerBillingMonth = 30 × 24 × 60 × 60 = 2,592,000
```

CDN usage cost:

```text
round(incomingRps × secondsPerBillingMonth / 1,000,000 × cdnUsageCostPerMillionRequests)
```

plus the tier base. Without traffic metrics, CDN cost is base-only so architecture-only estimates stay valid.

## Workload affinity unit-cost pressure

When a challenge authors `workloadAffinity.mechanisms[*].unitCostPressure`, the cost model multiplies **usage-sensitive** line amounts for components that are **ACTIVE** (handled work > 0) by that factor. Catalog base pricing remains primary:

- Service / Postgres: pressure applies to the component’s monthly amount when the node handled traffic.
- CDN: pressure applies to the **usage** portion only; tier base is unchanged.
- IDLE / unreachable nodes: pressure stays `1.0` — optional base monthly cost still applies; no hidden efficiency tax on unused boxes.
- Omitting affinity or omitting `unitCostPressure` preserves legacy pricing (`1.0`).

Do not invent a second price book in the UI. Consume `CostResult` from `estimateMonthlyCost`.

## Cross-region transfer (Phase 3)

Transfer cost is driven by simulated `geographicRoutes`, not an arbitrary multi-region penalty.

```text
monthly $ = round(bytes/sec × secondsPerBillingMonth / 1e9 × $/GB)
```

- Same-region: `$0/GB`
- Cross-region: flat educational `$0.02/GB` (not provider region-pair pricing)
- Payload sizes come from challenge `transferPayload` (redirect / write / DB read / DB write / replication bytes)
- Request-path bytes blend `readRatio × redirectResponseBytes + writeRatio × writeRequestBytes`
- Replication: primary write RPS × `replicationBytesPerWrite` to each remote replica region
- Line items group by region pair (`Transfer · …`, `Replication · …`) and enter shared `CostResult`

### CDN vs transfer

CDN usage prices **edge request volume** (Phase 2). Cross-region transfer prices **byte movement across region boundaries** on geographic routes and replication. CDN edge hits are not re-billed as transfer; origin-bound geographic hops that appear in `geographicRoutes` can still incur transfer when they cross regions.
