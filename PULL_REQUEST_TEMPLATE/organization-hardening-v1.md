## Change summary

Describe the user-visible behavior, repositories/components affected, compatibility impact, and rollback path. Mark non-applicable checks as `N/A` with a reason.

## Organization hardening gates

- [ ] This work is on a topic branch; no direct default-branch commit is required.
- [ ] Cross-repository dependencies are pinned by immutable commit, lockfile, or released Zed package.
- [ ] Public contracts are generated from the canonical schema/interface source and consumer compatibility was checked.
- [ ] SQL has a stable organization/domain namespace and explicit owner; identity, ordering, checksums, drift detection, and promotion are registered through `declarative-migrations`.
- [ ] Application startup validates schema compatibility and does not apply production DDL.
- [ ] Destructive changes, tenant isolation, authorization, idempotency, and state-machine invariants have evidence.
- [ ] App manifests remain app-owned; cluster composition uses `oresoftware/k8s-cluster` and shared components use `oresoftware/k8s-libs-and-shared-defs`.
- [ ] Least privilege, restricted workloads, explicit network policy, immutable images, bounded resources, and fail-closed auth are addressed where applicable.
- [ ] Secrets, credentials, personal data, and user content are excluded from source, logs, fixtures, and artifacts.
- [ ] Zed lifecycle hooks run deterministic format, lint, build, contract, and publish checks.
- [ ] Unit, integration, adversarial, migration, clean-environment e2e, recovery, and teardown evidence is attached.
- [ ] ORES OTEL propagation is present where applicable, with secrets and user content excluded by default.

## Validation evidence and residual risk

List commands, fixtures, test-org runs, migration/drift results, teardown evidence, and known limitations.
