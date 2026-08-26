# Cost model

Cost is a deterministic simulation constraint, not presentation-only metadata. The simulator calculates it from canonical architecture state so browser and server agree.

Phase 1 uses simplified educational monthly estimates, not cloud-provider pricing: a Stateless Service costs $1,000 per instance and Postgres costs $2,000/$4,000/$7,000 for small/medium/large. Traffic Source has no infrastructure cost. `estimateMonthlyCost` in `@faultline/simulator` returns the shared `CostResult`; the UI must consume it rather than duplicate these rules.
