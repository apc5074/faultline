# Simulator

`packages/simulator` is the deterministic simulation source of truth, shared by browser and server. It must stay independent of React, the DOM, AI, and Supabase.

Simulation decides outcomes, including pass/fail; an LLM never does. Geography, cost, and emitted events are real simulation constraints, and UI animations will consume events rather than recreate simulation logic.

## Validation before simulation

`validateArchitectureForSimulation` is the Phase 1 entry boundary. It first validates canonical architecture shape, then checks registered component types/configuration, allowed challenge types, endpoint existence, self-connections, catalog port existence, semantic port compatibility, and a viable request path from a Traffic Source. It returns structured errors for ordinary player mistakes and does not silently ignore invalid graph data. Traffic propagation and performance calculations arrive in later simulator tickets.
