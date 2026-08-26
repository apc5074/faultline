# Components

`packages/component-catalog` owns component definitions and their simulation-facing metadata. New components register there because a level needs them, rather than through UI-specific behavior.

`ComponentRegistry` is the single registration boundary. It validates each definition, rejects duplicate stable types, resolves known definitions, and enumerates the registered catalog. A definition contains validated default configuration, domain port metadata, declared metrics, optional simulation/cost metadata, and explicit future-support flags. It must not contain challenge workload.

Level 1 is expected to require service, Postgres, Redis, router, load balancer, CDN, replicas, and geography. Component definitions and UI rendering are not implemented yet.

`postgres` is the Phase 1 database primitive. Its `small`, `medium`, and `large` educational tier model keeps read capacity, write capacity, and monthly cost together while deliberately modelling reads and writes independently. It accepts only a typed `read_write` database input and has no replica, failover, or geography behavior.
