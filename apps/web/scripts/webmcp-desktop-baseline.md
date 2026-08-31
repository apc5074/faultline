# WebMCP desktop freshness matrix

Manual acceptance record for CTX-007. Use one deployed Preview and the fixed
Level 1 fixture. Record the host/model and browser build before running the
matrix; do not paste board payloads or response prose into this report.

| Case | Tool called | Selector | Expected fact | Actual fact | Revision | Pass/fail |
| --- | --- | --- | --- | --- | --- | --- |
| One Postgres | `inspect_component` | `postgres`, `all` | 1 component | — | — | Pending manual Preview |
| Add Postgres without Run | `inspect_component` | `postgres`, `all` | 2 components | — | — | Pending manual Preview |
| Change Service instances | `inspect_component` | `service`, `all` | Same Service-box count | — | — | Pending manual Preview |
| Remove component | `inspect_component` | exact ID | Removed component is absent | — | — | Pending manual Preview |
| Disconnect edge | `inspect_design_entity` | connection endpoints | Relationship is absent | — | — | Pending manual Preview |
| Repeat without edit | `inspect_component` | same as prior case | Stable current fact | — | — | Pending manual Preview |

## Run metadata

- Host/model version: pending manual Preview
- Browser/WebMCP build: pending manual Preview
- Timestamp: pending manual Preview
- Privacy check: automated trace verification confirms no component IDs,
  labels, configuration values, prompts, or response prose are retained.
- Automated proxy: `verify-webmcp-evidence-store` covers the registered
  production callback one-Postgres → two-Postgres → survivor flow and revision
  changes. It is not a substitute for this manual host run.
