# Components

`packages/component-catalog` will own component definitions and their simulation-facing metadata. New components register there because a level needs them, rather than through UI-specific behavior.

Level 1 is expected to require service, Postgres, Redis, router, load balancer, CDN, replicas, and geography. Component definitions and UI rendering are not implemented.
