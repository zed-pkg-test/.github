# DEN-3475 — nightly `*-clients` fleet audit

This harness is the fail-closed controller for every active GitHub repository whose name ends **exactly** in `-clients`.

## Schedule and execution

`.github/workflows/den-3475-nightly-clients-fleet-audit.yml` runs nightly at **03:00 `America/Chicago`**. Scheduled runs use `harden` mode; push validation uses read-only `audit` mode; operators can select either mode through `workflow_dispatch`.

The controller dynamically inventories repositories through the authenticated GitHub API. It excludes archived repositories, disabled repositories, test organizations, and names that do not end exactly in `-clients`; there is no hand-maintained package allowlist.

## Enforced contract

For every discovered package the run:

1. requires a root `clients/` tree with at least 15 substantive language/runtime implementations;
2. requires root `.zpkg.toml` and committed `.zpkg.lock` files;
3. builds the current tips of `zed-pkg/zed-cli`, `zed-pkg/zed-api-server.rs`, and `zed-pkg/zed-interfaces` once per run;
4. validates each package with the freshly built `zed validate --require-lock`, `zed release plan --json`, and `zed pack` commands;
5. requires a draft-2020-12/2019-09 JSON Schema that declares public/private classes, methods, functions, interfaces, and types;
6. requires a package-specific `api-surface.json` with stable symbol IDs, canonical signatures, source paths, and an implementation or justified `not-applicable` declaration for every detected runtime;
7. compiles and tests every detected runtime in a native container or a repository-owned `.zed/audit.sh`;
8. resolves `orgx-test` for production owner `orgx`, discovers explicit consumers by source/package references, runs `zed install --frozen`, then runs each consumer's native compile/test contract;
9. emits a JSON run ledger, Markdown summary, exact Zed-tip inventory, SHA-256 evidence digest, and a Linear update.

Missing evidence, skipped semantic mappings, missing consumers, and failed commands are errors—not successes.

## Hardening boundary

`harden` mode may create or update only deterministic, additive scaffolding:

- `schema/api-surface.schema.json` and explanatory contract documentation when no API-surface schema exists;
- `.github/workflows/clients-contract.yml`, pinned to the reviewed reusable 18-runtime matrix at an immutable commit;
- a focused **draft** pull request;
- one deduplicated GitHub issue per nonconformant package.

The automation never fabricates API symbols, creates empty runtime directories, weakens tests, rewrites history, force-pushes, or reports placeholders as implementations.

## Required secrets

Install these as GitHub Actions secrets on `zed-pkg-test/.github` or at the organization level:

- `CLIENTS_AUDIT_GH_TOKEN` — preferred cross-organization credential. It needs repository metadata read, contents read, and—only for harden mode—contents, pull-request, and issue write access to the audited production and matching test organizations.
- `LINEAR_API_TOKEN` — permits a nightly evidence comment on `DEN-3475`.

For migration only, the workflow also accepts existing `SUBMODULE_TOKEN` or `TEST_ORG_READ_TOKEN` as GitHub-token fallbacks and `LINEAR_TOKEN` as the Linear fallback. Credentials are passed only through the secret store, are never written to clone URLs, and are redacted from captured diagnostics.

## Local checks

The pure contract layer has no third-party JavaScript dependencies:

```sh
node --check contract-tests/den-3475-clients-fleet-audit/audit-clients-fleet.mjs
node --test contract-tests/den-3475-clients-fleet-audit/lib.test.mjs
```

A live fleet run additionally requires GitHub credentials, Git, Cargo, Docker, and network access:

```sh
CLIENTS_AUDIT_GH_TOKEN=... \
LINEAR_API_TOKEN=... \
node contract-tests/den-3475-clients-fleet-audit/audit-clients-fleet.mjs \
  --mode audit \
  --max-repositories 1
```
