# Public Rust exact-SHA verifier

The reusable workflow at `.github/workflows/public-rust-exact-sha.yml` provides an independent, read-only validation lane for a public Rust repository when the source owner's hosted runner allocation, billing, or organization policy prevents its normal checks from starting.

It is a continuity mechanism, not a replacement for the source repository's required checks or branch protection.

## Security and trust boundary

The workflow accepts only:

- a public repository selector matching `owner/name`;
- an exact lowercase 40-character commit SHA;
- a safe repository-relative path ending in `Cargo.toml`; and
- an exact numeric Rust toolchain version.

It rejects branch names, tags, abbreviated SHAs, absolute paths, parent traversal, shell metacharacters, non-Cargo manifests, and floating Rust channels. The target checkout uses no persisted credential. A token scoped to this test repository cannot read a private target repository, so the lane is intentionally public-only.

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

It contains no user-provided secret, authorization header, repository token, or environment dump.

## Reusable invocation

After this workflow is merged, callers can pin it to an immutable commit:

```yaml
jobs:
  verify-public-rust:
    uses: zed-pkg-test/.github/.github/workflows/public-rust-exact-sha.yml@<immutable-workflow-commit>
    with:
      repository: ORESoftware/k8s-libs-and-shared-defs
      commit_sha: 7f7f130c445101abfed2d40b66880631c614abc2
      manifest_path: ores-read-cache/Cargo.toml
      rust_toolchain: 1.85.1
```

Do not call a floating branch or tag in a promotion workflow.

## Initial self-test

The pull-request path self-tests the workflow against the immutable head of `ORESoftware/k8s-libs-and-shared-defs#25`, whose source-owner GitHub Actions jobs were created but never assigned a runner because of the owner's billing/spending-limit state.

Tracking:

- Linear DEN-1550 — independent GitHub Actions continuity
- Linear DEN-2839 — `ores-read-cache` contract
- source PR `ORESoftware/k8s-libs-and-shared-defs#25`
