# Architecture

`apps/web` is the Next.js product surface. `packages/core` owns framework- and provider-independent contracts.

The browser canvas and future world map must consume one canonical architecture state. The human owns architecture edits during a challenge; agents may inspect or challenge a design but do not edit it.

Supabase, Vercel, AI providers, and browser APIs are adapters around these boundaries, not sources of architecture truth. Persistence, canvas state, and adapter implementations are not yet built.

## Canonical architecture

`Architecture` in `@faultline/core` is the single serializable domain representation. It has an explicit `version`, stable component and connection IDs, component configuration, reserved region deployment data, and presentation-only `ui` coordinates. UI coordinates never belong to simulation input.

Use `validateArchitecture` or `parseArchitecture` when architecture-shaped data crosses an untrusted boundary. This first validation layer checks the serializable shape, version, identity uniqueness, and initial semantic connection fields. Later tickets add component, port, graph, and challenge validation without introducing a second architecture model.

## Typed connections

Phase 1 uses two semantic connection types: `request` for incoming traffic and `read_write` for a service's database traffic. `PortDefinition` describes a port's stable ID, direction, and supported semantic types. `checkConnectionCompatibility` is a pure core function: it permits only output-to-input pairs that both support the requested type. The component catalog will own the actual Traffic Source, Service, and Postgres port definitions; React Flow will later render handles from those definitions.
