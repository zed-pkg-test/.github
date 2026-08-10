# Repository boundary: infrastructure stays separate

**Policy ID:** `repo-boundary/infra-not-app-submodule/v1`  
**Status:** Permanent organization architecture rule

- A repository named `*-infra` is a standalone infrastructure and deployment codebase. Equivalent infrastructure suffixes such as `*.infra` are governed by the same separation rule.
- An infrastructure repository **must not** be added to any `*-monorepo` as a Git submodule, including under `apps/`, `repos/`, `deploy/`, or another alias path.
- Application/source code and infrastructure code must remain in separate repositories with independent history, ownership, release, and deployment lifecycles.
- A monorepo may integrate with infrastructure only through documented configuration, versioned contracts, CI/CD inputs, published artifacts, or deployment APIs. It must not vendor, nest, mount, or submodule the infrastructure repository.
- Any existing monorepo gitlink whose path, section, or remote identifies an infrastructure repository is non-conforming and must be removed.

Repository scaffolding, migration tooling, and automated agents must preserve this boundary unless the policy is explicitly revised.

## Enforcement

Run `python3 scripts/check_infra_monorepo_boundary.py --repository owner/example-monorepo` in a monorepo checkout. The dependency-free validator examines both submodule paths and target repository URLs, including SSH, HTTPS, relative URLs, dotted infra names, and generic aliases such as `apps/infra`.

The validator and its fixtures are documented in [`docs/INFRA_MONOREPO_BOUNDARY_ENFORCEMENT.md`](docs/INFRA_MONOREPO_BOUNDARY_ENFORCEMENT.md).
