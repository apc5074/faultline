# WebMCP

# WebMCP

`packages/webmcp` will eventually adapt the shared agent-capability layer to browser WebMCP. It is a progressive enhancement: absence or incompatibility must not affect the product surface. WebMCP must not duplicate domain logic, own architecture state, or decide simulation outcomes.

## Phase 0 spike

`apps/web/features/webmcp-spike/WebMcpSpike.tsx` is an isolated, temporary browser-only spike. On mount it feature-detects the current draft imperative API, `document.modelContext.registerTool(tool, { signal })`, and registers exactly one no-input read-only tool:

```text
get_faultline_status() -> { app: "faultline", phase: 0, status: "online" }
```

Its `AbortController` signal is aborted on unmount. Invocation changes only the temporary on-page debug indicator; it does not modify architecture state or call a server. Registration rejection and missing `document.modelContext` are intentionally ignored, so unsupported browsers render the shell unchanged.

**API shape checked — 2026-08-25:** the WebMCP community draft describes `document.modelContext.registerTool()` with a tool object containing `name`, `description`, `inputSchema`, and `execute`, plus optional registration options. The browser/agent discovery mechanism is browser-mediated; page code does not enumerate agents or tools.

Chrome origin-trial enrollment is configured with the browser-safe `NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN`. When present, the application emits it as `<meta http-equiv="origin-trial">`; configure it for the exact deployed origin in Vercel before testing. It is public by design and must be entered as Vercel Config, not Secret.

**Verification — 2026-08-25:** the project owner verified the deployed spike in Chrome 150 after enabling Chrome's WebMCP testing feature. `document.modelContext` became available and the temporary tool worked. Before adopting a Phase 6 adapter, record the eventual client discovery, structured output, and lifecycle behavior against the final adapter.

## Annotation lifecycle

Agent coaching marks live in `AgentSessionState.annotations` and render on the canvas via `AgentAnnotationLayer`. They never mutate architecture.

| Event | Behavior |
| ----- | -------- |
| Component or connection deleted / architecture fingerprint change | Orphan focus, note, path, and pending-help IDs are pruned. Session revision is unchanged. |
| **Clear marks** (sim bar) | Human clears **all** agent annotations without reconnecting WebMCP. |
| **Run** | Clears ephemeral **`focus`** ticks only. Keeps **`note`**, **`path`**, and **`stamp`** so coaching prose remains while fresh simulator evidence loads. |

Agents may also call `clear_annotations`; humans use **Clear marks**.
