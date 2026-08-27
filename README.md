# Faultline

Faultline is a daily distributed-systems design game.

## Development

Install dependencies from the repository root:

```sh
pnpm install
```

Run the local application at `http://localhost:3000`:

```sh
pnpm dev
```

Run the available checks:

```sh
pnpm typecheck
pnpm build
```

Agent starting points:

- `AGENTS.md` — repository-wide rules
- `docs/CODEX.md` — code navigation, boundaries, verification, and common traps
- `plans/phase N/plan.md` — active implementation sequence

See the active phase plan for the current product state; the phase number in
this README is intentionally not hard-coded.
