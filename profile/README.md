# zed-pkg-test

Independent acceptance organization for **zed-pkg**.

Black-box certification for Zed resolution, storage, adapters, migration, registry, concurrency, Nix, and supply-chain safety.

## Portfolio

| Repository | Class | Readiness | Primary dependency path |
|---|---|---|---|
| `recursive-diamond-graph` | package-manager | `ready` | `zed` |
| `recursive-cycle-detection` | package-manager | `ready` | `zed` |
| `concurrent-install-locking` | chaos/fault injection | `ready` | `matrix` |
| `overtake-submodule-migration` | interoperability | `ready` | `git-submodule` |
| `nix-export-interop` | package-manager | `ready` | `matrix` |
| `first-install-manifest` | package-manager | `ready` | `matrix` |
| `constraint-solver-blackbox` | package-manager | `ready` | `matrix` |
| `registry-api-contract` | API contract | `ready` | `matrix` |
| `registry-browser-e2e` | browser E2E | `ready` | `matrix` |
| `security-path-traversal` | security | `ready` | `matrix` |

Pull requests run deterministic harness checks. Emulators, desktop matrices, live APIs/providers, databases, chaos, scale, and soaks are scheduled/manual. Missing upstreams or credentials are blocked readiness—not false passes or product regressions.
