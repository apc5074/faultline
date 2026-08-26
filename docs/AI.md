# AI

Embedded AI will interpret simulator evidence and help challenge a human design. It never invents metrics or decides correctness; the deterministic simulator does.

`packages/agent-capabilities` defines adapter-neutral semantic capability contracts. A capability has a name, description, validated input boundary, mode (`read`, `experiment`, or `visual`), availability predicate, execution contract, and optional annotations. The embedded AI and WebMCP adapters will consume that layer instead of duplicating business logic.

Business logic must live beneath adapters: future AI SDK and WebMCP implementations will delegate to the same semantic capability. Phase 1 establishes only these types; it does not register or expose any capability, and no AI integration is implemented yet.
