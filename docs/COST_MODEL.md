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