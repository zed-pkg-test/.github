# Rust exact-SHA verifier

The reusable workflow at `.github/workflows/public-rust-exact-sha.yml` provides an independent, read-only validation lane for a Rust repository when the source owner's hosted runner allocation, billing, or organization policy prevents its normal checks from starting.

It is a continuity mechanism, not a replacement for the source repository's required checks or branch protection.

## Security and trust boundary

The workflow accepts only:

- a repository selector matching `owner/name`;
- an exact lowercase 40-character commit SHA;
- a safe repository-relative path ending in `Cargo.toml`; and
- an exact numeric Rust toolchain version.

It rejects branch names, tags, abbreviated SHAs, absolute paths, parent traversal, shell metacharacters, non-Cargo manifests, and floating Rust channels.

Public repositories need no caller secret. A private target requires a caller-supplied read-only `checkout_token`, normally from a protected organization or repository secret. The token is passed directly to `actions/checkout`, checkout credentials are not persisted, and the workflow never prints or uploads it. Do not pass a token through a workflow input, command line, artifact, environment dump, issue, or pull-request body.

Before executing code, the workflow verifies that the checked-out commit equals the requested SHA and that the manifest resolves to a regular file contained by the checkout root.

## Commands

For the selected manifest, the workflow runs:

```sh
cargo test --manifest-path <manifest> --all-targets
cargo clippy --manifest-path <manifest> --all-targets -- -D warnings
```

A separate temporary Cargo target directory prevents build artifacts from entering the candidate checkout. The evidence artifact contains:

- requested repository, exact requested and actual SHA, and manifest path;
- `rustc` and `cargo` version metadata;
- complete test and Clippy logs; and
- the final candidate worktree status.

It contains no user-provided secret, authorization header, token value, or environment dump.

## Public reusable invocation

After this workflow is merged, public callers can pin it to an immutable commit:

```yaml
jobs:
  verify-rust:
    uses: zed-pkg-test/.github/.github/workflows/public-rust-exact-sha.yml@<immutable-workflow-commit>
    with:
      repository: zed-pkg-test/rust-lib
      commit_sha: e2382ee42b253ec8741b1aa5d0ebb165bb888257
      manifest_path: Cargo.toml
      rust_toolchain: 1.85.1
```

## Private reusable invocation

A caller with a protected read token may pass it through the reusable-workflow secret boundary:

```yaml
jobs:
  verify-private-rust:
    uses: zed-pkg-test/.github/.github/workflows/public-rust-exact-sha.yml@<immutable-workflow-commit>
    with:
      repository: ORESoftware/k8s-libs-and-shared-defs
      commit_sha: 7f7f130c445101abfed2d40b66880631c614abc2
      manifest_path: ores-read-cache/Cargo.toml
      rust_toolchain: 1.85.1
    secrets:
      checkout_token: ${{ secrets.TEST_ORG_READ_TOKEN }}
```

`TEST_ORG_READ_TOKEN` should be a short-lived or GitHub-App-issued credential with contents-read access only to the required source repository. Do not use a broad personal token when a scoped app token is available.

Do not call the reusable workflow at a floating branch or tag.

## Pull-request self-test

The pull-request path self-tests the workflow mechanics against the public immutable head of `zed-pkg-test/rust-lib`. The original cache candidate is private, so its exact-SHA validation remains blocked until a protected cross-organization read secret is installed; the failed anonymous checkout is retained as evidence of the boundary rather than bypassed by publishing private source into the test organization.

Tracking:

- Linear DEN-1550 — independent GitHub Actions continuity
- Linear DEN-2839 — `ores-read-cache` contract
- source PR `ORESoftware/k8s-libs-and-shared-defs#25`
