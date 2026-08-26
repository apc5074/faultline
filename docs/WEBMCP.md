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

**Not yet verified:** this environment has no compatible browser agent available to observe deployed discovery, invocation, structured output, or unmount behavior. Before adopting a Phase 6 adapter, manually verify those behaviors in a WebMCP-enabled browser and record its version, agent/client, and origin-trial/feature configuration here.
