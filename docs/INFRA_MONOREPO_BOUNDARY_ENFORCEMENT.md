# Infra/monorepo boundary enforcement

Policy ID: `repo-boundary/infra-not-app-submodule/v1`

`*-infra` repositories—and equivalent dotted names such as `*.infra`—remain
standalone infrastructure codebases. They must not be Git submodules of a
monorepo, whether under `apps/`, `repos/`, `deploy/`, or another path.

The dependency-free validator inspects both each submodule path and the target
repository name derived from HTTPS, SSH, scp-style, or relative Git URLs. This
catches aliases such as `apps/infra` pointing to `ftnl-infra`.

```bash
python3 scripts/check_infra_monorepo_boundary.py \
  /path/to/monorepo/.gitmodules \
  --repository owner/example-monorepo
```

Exit status `0` means compliant or not applicable, `2` means the boundary is
violated, and `3` means the manifest could not be parsed. Use `--json` for
machine-readable audit output.
