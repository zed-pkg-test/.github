# zed-pkg-test

Independent acceptance organization for **zed-pkg**.

Black-box certification for Zed resolution, storage, adapters, migration,
registry, concurrency, Nix, OCI, offline replay, and supply-chain safety.

## Planning and delivery

- **Canonical Linear project:** [`github.com/zed-pkg-test`](https://linear.app/denman/project/githubcomzed-pkg-test-e0b5db761974)
- **Intended GitHub Project title:** `zed-pkg-test-project`
- **Cross-system registry:** [`zed-pkg/zed-docs` doc 33](https://github.com/zed-pkg/zed-docs/blob/main/docs/33-github-linear-project-registry.md)
- **Machine-readable mapping:** [`github-linear-project-registry.toml`](https://github.com/zed-pkg/zed-docs/blob/main/config/github-linear-project-registry.toml)
- **Linear registry document:** [GitHub organization → Linear project → GitHub Project registry](https://linear.app/denman/document/github-organization-linear-project-github-project-registry-997be66819bb)

The organization Project number and URL are intentionally not claimed until
GitHub returns them. Organization Projects currently require additional Projects
permission; do not infer `/projects/1`.

## Portfolio

| Repository | Class | Readiness | Primary dependency path |
|---|---|---|---|
| `zed-pkg-e2e` | aggregate lifecycle and external canaries | `ready` | `matrix` |
| `recursive-diamond-graph` | package-manager | `ready` | `zed` |
| `recursive-cycle-detection` | package-manager | `ready` | `zed` |
| `concurrent-install-locking` | chaos/fault injection | `ready` | `matrix` |
| `overtake-submodule-migration` | interoperability | `ready` | `git-submodule` |
| `nix-export-interop` | Nix interoperability | `ready` | `matrix` |
| `manager-interop-e2e` | environment-manager interoperability | `ready` | `matrix` |
| `oci-multiplatform-e2e` | OCI interoperability | `ready` | `matrix` |
| `offline-cache-e2e` | offline replay | `ready` | `matrix` |
| `security-adversarial-e2e` | security/adversarial | `ready` | `matrix` |
| `first-install-manifest` | package-manager | `ready` | `matrix` |
| `constraint-solver-blackbox` | package-manager | `ready` | `matrix` |
| `registry-api-contract` | API contract | `ready` | `matrix` |
| `registry-browser-e2e` | browser E2E | `ready` | `matrix` |
| `security-path-traversal` | security | `ready` | `matrix` |

Language fixture families include Node.js, Rust, Go, Python, Dart, Gleam,
Erlang, Java, Kotlin, C#, Swift, polyglot packages, workspaces, submodules,
subtrees, version conflicts, and deliberately adversarial package layouts.

## Artifact policy

This organization publishes workflow certification evidence, bounded failure
diagnostics, checksums, and immutable replay inputs. A workflow artifact is not
a production package or release merely because it was archived. Test workflows
must not publish to package registries, releases, OCI registries, or binary
caches unless that mutation is the explicit subject of a separately reviewed
isolated test environment.

Pull requests run deterministic harness checks. Emulators, desktop matrices,
live APIs/providers, databases, chaos, scale, and soaks are scheduled/manual.
Missing upstreams or credentials are blocked readiness—not false passes or
product regressions.
