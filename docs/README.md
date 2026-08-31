# Faultline documentation index

This directory contains durable contracts and operating guides for Faultline.
Use the index to find the right boundary; use the current implementation and
verification scripts to determine what the system actually does.

## Source-of-truth order

When documents disagree with code, follow this order:

1. Current public types, implementations, registrations, routes, and database
   migrations.
2. Executable package/root verification scripts.
3. The focused document linked below.
4. Plans, tickets, and historical notes for scope or intent only.

No document in this directory authorizes duplicating domain logic in another
package. Update the owning contract when an implementation change makes prose
wrong.

## Start here

| Need | Read |
| --- | --- |
| Repository-wide rules, trust order, safety, and verification | [root `AGENTS.md`](../AGENTS.md) |
| Fast code map and edit routing for coding agents | [`CODEX.md`](CODEX.md) |
| Product loop and current player-facing routes | [`PRODUCT.md`](PRODUCT.md) |
| System boundaries and canonical data flow | [`ARCHITECTURE.md`](ARCHITECTURE.md) |

## Domain contracts

| Contract | Covers |
| --- | --- |
| [`COMPONENTS.md`](COMPONENTS.md) | Catalog registration, component definitions, config schemas, ports, deployments, metrics, presentation metadata, and extension workflow. |
| [`SIMULATOR.md`](SIMULATOR.md) | Validation, traffic, capacity, latency, geography, workload paths, cost inputs, events, and requirement evaluation. |
| [`COST_MODEL.md`](COST_MODEL.md) | Deterministic component, usage, transfer, and workload-affinity cost behavior. |
| [`AGENT_CAPABILITIES.md`](AGENT_CAPABILITIES.md) | Shared capability model, context/evidence, modes, resolvers, consent, production exposure, and adapter rules. |
| [`WEBMCP.md`](WEBMCP.md) | Browser WebMCP groups, evidence leases, envelopes, lifecycle, safety, visual/experiment bridges, and observability. |
| [`AI.md`](AI.md) | Embedded AI boundary and its relationship to shared capabilities and simulator evidence. |

## APIs, identity, and operations

| Contract | Covers |
| --- | --- |
| [`API_AND_PERSISTENCE.md`](API_AND_PERSISTENCE.md) | Current HTTP routes, trusted submission flow, persistent records, RLS/derived data, and migration rules. |
| [`ACCOUNTS.md`](ACCOUNTS.md) | Anonymous/permanent identity, GitHub linking, cookies, history/streaks, public privacy boundaries, and account persistence. |
| [`PRODUCTION.md`](PRODUCTION.md) | Environment/runtime boundaries, deployment behavior, production probes, migration operations, and competition republishing checks. |
| [`WEBMCP_COMPETITION.md`](WEBMCP_COMPETITION.md) | Competition-specific agent prompt/smoke guidance and fair-play constraints. |

## Package-local agent guides

These are closer to the code they govern and should be read when editing that
package:

| Package | Guide |
| --- | --- |
| Simulator | [`packages/simulator/AGENTS.md`](../packages/simulator/AGENTS.md) |
| Agent capabilities | [`packages/agent-capabilities/AGENTS.md`](../packages/agent-capabilities/AGENTS.md) |
| Web application | [`apps/web/AGENTS.md`](../apps/web/AGENTS.md) |

If a package-local guide is absent, start at the root guide and inspect that
package’s `package.json`, public exports, and nearest verifier.

## Reading paths by task

### Change a component

[`COMPONENTS.md`](COMPONENTS.md) → `packages/component-catalog/src` →
[`SIMULATOR.md`](SIMULATOR.md) if behavior changes → the intended challenge
profile → relevant web/agent consumers.

### Change simulator truth

[`ARCHITECTURE.md`](ARCHITECTURE.md) → [`SIMULATOR.md`](SIMULATOR.md) →
[`COST_MODEL.md`](COST_MODEL.md) when pricing/transfer is involved → server
verification and agent evidence consumers.

### Change an agent or WebMCP tool

[`AGENT_CAPABILITIES.md`](AGENT_CAPABILITIES.md) →
[`WEBMCP.md`](WEBMCP.md) when browser exposure is involved →
`packages/agent-capabilities` / `packages/webmcp` verifiers → live web context
integration.

### Change an official attempt, API, or database flow

[`API_AND_PERSISTENCE.md`](API_AND_PERSISTENCE.md) → [`ACCOUNTS.md`](ACCOUNTS.md)
for identity → [`PRODUCTION.md`](PRODUCTION.md) for deployment/migration
operations → matching route and persistence verifiers.

### Change the player experience

[`PRODUCT.md`](PRODUCT.md) → [`ARCHITECTURE.md`](ARCHITECTURE.md) →
`apps/web/AGENTS.md` → the owning feature and its focused web verifier.

## Verification map

Documentation is explanatory; executable checks are the contract. Start with
the narrowest relevant command:

```sh
pnpm --filter @faultline/core verify
pnpm --filter @faultline/component-catalog verify
pnpm --filter @faultline/challenges verify
pnpm --filter @faultline/simulator verify
pnpm --filter @faultline/agent-capabilities verify
pnpm --filter @faultline/webmcp verify
pnpm --filter @faultline/web typecheck
```

For cross-package changes, use the root checks documented in
[`CODEX.md`](CODEX.md), including `pnpm typecheck`, `pnpm build`,
`pnpm verify:agent-context`, `pnpm verify:affinity`, or
`pnpm verify:level-profiles` as applicable.

## Updating this index

Add a document here when it establishes a durable boundary or workflow that
agents need repeatedly. Keep the entry anchored to a real file/package and
describe current scope, not a roadmap. If a contract moves, update links and
the relevant package-local guide in the same change. Do not turn this index
into a second implementation specification.
