# .github
Governance and reusable test workflow policy for zed-pkg-test.

<!-- ore-org-baseline:begin -->
## Organization-wide defaults

This public repository is the canonical source for GitHub-supported community-health fallbacks, organization profile content, contribution guidance, public security/support policy, issue and pull-request templates, and agent-governance declarations for [`zed-pkg-test`](https://github.com/zed-pkg-test).

## Canonical organization links

- GitHub organization: https://github.com/zed-pkg-test
- Public organization defaults: https://github.com/zed-pkg-test/.github
- Canonical Linear project: https://linear.app/denman/project/githubcomzed-pkg-test-e0b5db761974
- Fleet tracking issue: https://github.com/ORESoftware/k8s-cluster/issues/1222

## Safety baseline

All Git conflicts must be resolved semantically with full historical, repository-wide, organization-wide, and relevant external-organization context. Automated agents are hard-denied from destructive or history-rewriting operations, including all forms of `git stash`, `git reset`, `git clean`, `git filter-repo`, force pushing, destructive deletion, data or infrastructure teardown, credential revocation, and policy bypass.

## GitHub inheritance boundary

GitHub can use supported community-health files from a public organization `.github` repository as fallbacks and can render `profile/README.md` on the organization page. `agents.md`, `AGENTS.md`, Copilot instructions, workflows, settings, rulesets, branch protections, permissions, and secrets are not automatically inherited merely because they exist here. Each repository must carry or synchronize compatible local policy and explicitly call reusable workflows where enforcement is required.

Generated managed-policy version: `2026-08-08`.
<!-- ore-org-baseline:end -->
<!-- BEGIN MANAGED REPOSITORY RELATIONSHIPS v1 -->
## Repository relationship registry

`zed-pkg-test` declares repository roles, dependency edges, cross-organization capabilities, deployment ownership, and the git-submodule/Zed-package contract:

- [Human-readable map](architecture/REPOSITORY_RELATIONSHIPS.md)
- [Machine-readable manifest](architecture/repository-relationships.json)
- [JSON Schema](architecture/repository-relationships.schema.json)

The public registry withholds private repository names and edges.
<!-- END MANAGED REPOSITORY RELATIONSHIPS v1 -->

## Acceptance-fleet governance

This repository also owns the organization-level community-health defaults,
reusable workflow policy, and conventions shared by the deterministic
`zed-pkg-test` acceptance fixtures.
