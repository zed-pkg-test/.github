# DEN-957 missing test-organization readiness

This is an administrative readiness contract for the four Rust MCP servers whose matching test organizations did not exist during the August 8, 2026 reconciliation.

It is intentionally **not** a substitute source-provenance or Rust test harness. Full byte-exact provenance remains required in each matching organization after it is created.

## Targets

- `benefactor-cc-test` for `benefactor-cc/benefactor-cc-mcp-server.rs`
- `daedalus-fab-test` for `daedalus-fab/daedalus-fab-mcp-server.rs`
- `athlet-o-test` for `athlet-o/athleto-mcp-server.rs`
- `akrion-sim-test` for `akrion-sim/akrion-mcp-server.rs`

## What the workflow verifies

The workflow validates the local manifest and queries the public GitHub organization endpoint without credentials. While an organization is absent, HTTP 404 is the expected result. When an organization appears, the workflow fails deliberately and directs the operator to:

1. install the connected GitHub App;
2. create `mcp-contract-e2e`;
3. add the standard generated test-org baseline;
4. add byte-exact snapshots with Git blob provenance;
5. merge a reviewed PR and record its successful workflow run in the DEN-957 fleet ledger.

The workflow uses read-only repository permissions, does not persist checkout credentials, and does not require a production PAT or other service token.

The administrative follow-up is tracked at `ORESoftware/mcp-rust-libs#20`.
