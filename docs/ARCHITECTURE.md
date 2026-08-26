# Architecture

`apps/web` is the Next.js product surface. `packages/core` will contain framework- and provider-independent contracts. It is intentionally empty of domain types until a level requires them.

The browser canvas and future world map must consume one canonical architecture state. The human owns architecture edits during a challenge; agents may inspect or challenge a design but do not edit it.

Supabase, Vercel, AI providers, and browser APIs are adapters around these boundaries, not sources of architecture truth. Persistence, canvas state, and adapter implementations are not yet built.
