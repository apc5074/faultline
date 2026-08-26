# Challenges

`packages/challenges` owns configured scenarios, objectives, and constraints. Challenges score outcomes rather than prescribed technologies.

Challenge configuration uses the canonical architecture model and simulator evidence. Daily scheduling, attempts, submissions, and leaderboard behavior are not implemented.

## Tiny API

`tiny-api` is a development-only Phase 1 challenge, not a product level. Its configuration supplies 6,000 requests/sec with a 90% read and 10% write split, four outcome requirements (throughput, p95 latency, headroom, and budget), an $8,000/month budget, and exactly the Traffic Source, Stateless Service, and Postgres component types. It does not declare a required topology or a winning configuration; `evaluateRequirements` in the simulator scores those outcomes from capacity, latency, and cost.
