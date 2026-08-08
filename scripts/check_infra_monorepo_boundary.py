#!/usr/bin/env python3
"""Enforce repo-boundary/infra-not-app-submodule/v1.

A repository whose name represents infrastructure must not be a Git submodule
of a monorepo. The check inspects both the configured submodule path and the
repository basename derived from its URL, so aliases such as ``apps/infra`` are
still detected.
"""
from __future__ import annotations

import argparse
import configparser
import json
import os
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse

POLICY_ID = "repo-boundary/infra-not-app-submodule/v1"
INFRA_SUFFIX_RE = re.compile(r"(?:^|[-._])infra(?:structure)?$", re.IGNORECASE)
MONOREPO_TOKEN_RE = re.compile(r"(?:^|[-._])monorepo(?:$|[-._])", re.IGNORECASE)


@dataclass(frozen=True)
class Submodule:
    section: str
    path: str
    url: str


@dataclass(frozen=True)
class Violation:
    section: str
    path: str
    url: str
    repository_name: str
    reasons: tuple[str, ...]


def repository_basename(url: str) -> str:
    """Return a repository-like basename for HTTPS, SSH, scp, or relative URLs."""
    value = url.strip().rstrip("/")
    if not value:
        return ""

    # scp-like Git URL: git@github.com:owner/repository.git
    if ":" in value and "//" not in value and not value.startswith(("./", "../")):
        value = value.split(":", 1)[1]
    else:
        parsed = urlparse(value)
        if parsed.scheme or parsed.netloc:
            value = parsed.path

    name = PurePosixPath(value.rstrip("/")).name
    if name.casefold().endswith(".git"):
        name = name[:-4]
    return name


def is_infrastructure_name(value: str) -> bool:
    return bool(INFRA_SUFFIX_RE.search(value.strip()))


def is_monorepo_name(repository: str) -> bool:
    name = repository.rsplit("/", 1)[-1].strip()
    return bool(MONOREPO_TOKEN_RE.search(name))


def parse_gitmodules(path: Path) -> list[Submodule]:
    if not path.exists():
        return []
    if not path.is_file():
        raise ValueError(f"manifest is not a regular file: {path}")

    parser = configparser.RawConfigParser(interpolation=None, strict=True)
    parser.optionxform = str.lower
    try:
        with path.open("r", encoding="utf-8") as stream:
            parser.read_file(stream)
    except (configparser.Error, UnicodeError) as exc:
        raise ValueError(f"cannot parse {path}: {exc}") from exc

    submodules: list[Submodule] = []
    for section in parser.sections():
        if not section.casefold().startswith("submodule "):
            continue
        module_path = parser.get(section, "path", fallback="").strip()
        url = parser.get(section, "url", fallback="").strip()
        if not module_path or not url:
            missing = "path" if not module_path else "url"
            raise ValueError(f"{path}: section [{section}] is missing {missing}")
        submodules.append(Submodule(section=section, path=module_path, url=url))
    return submodules


def find_violations(submodules: list[Submodule]) -> list[Violation]:
    violations: list[Violation] = []
    for module in submodules:
        repo_name = repository_basename(module.url)
        path_name = PurePosixPath(module.path.rstrip("/")).name
        section_name = module.section.removeprefix('submodule ').strip().strip('"')

        reasons: list[str] = []
        if is_infrastructure_name(repo_name):
            reasons.append(f"submodule URL targets infrastructure repository {repo_name!r}")
        if is_infrastructure_name(path_name) or path_name.casefold() == "infra":
            reasons.append(f"submodule path identifies infrastructure at {module.path!r}")
        if is_infrastructure_name(section_name):
            reasons.append(f"submodule section identifies infrastructure as {section_name!r}")

        if reasons:
            violations.append(
                Violation(
                    section=module.section,
                    path=module.path,
                    url=module.url,
                    repository_name=repo_name,
                    reasons=tuple(dict.fromkeys(reasons)),
                )
            )
    return violations


def build_report(repository: str, manifest: Path) -> dict[str, object]:
    applicable = is_monorepo_name(repository)
    submodules = parse_gitmodules(manifest) if applicable else []
    violations = find_violations(submodules) if applicable else []
    return {
        "policy_id": POLICY_ID,
        "repository": repository,
        "manifest": str(manifest),
        "applicable": applicable,
        "checked_submodules": len(submodules),
        "violations": [asdict(item) for item in violations],
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "manifest",
        nargs="?",
        default=".gitmodules",
        help="path to .gitmodules (default: .gitmodules)",
    )
    parser.add_argument(
        "--repository",
        default=os.environ.get("GITHUB_REPOSITORY", "local/example-monorepo"),
        help="owner/repository name; defaults to GITHUB_REPOSITORY",
    )
    parser.add_argument("--json", action="store_true", help="emit a JSON report")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    manifest = Path(args.manifest)
    try:
        report = build_report(args.repository, manifest)
    except ValueError as exc:
        print(f"ERROR [{POLICY_ID}]: {exc}", file=sys.stderr)
        return 3

    violations = report["violations"]
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    elif not report["applicable"]:
        print(f"SKIP [{POLICY_ID}]: {args.repository} is not a monorepo-named repository")
    elif violations:
        print(
            f"FAIL [{POLICY_ID}]: {args.repository} contains {len(violations)} "
            "infrastructure submodule(s)",
            file=sys.stderr,
        )
        for item in violations:
            print(f"- {item['path']} -> {item['url']}", file=sys.stderr)
            for reason in item["reasons"]:
                print(f"    {reason}", file=sys.stderr)
        print(
            "Infrastructure and application code must remain in separate repositories; "
            "remove the infra gitlink and its .gitmodules section.",
            file=sys.stderr,
        )
    else:
        suffix = "no .gitmodules file" if not manifest.exists() else f"{report['checked_submodules']} submodule(s) checked"
        print(f"PASS [{POLICY_ID}]: {args.repository}; {suffix}")

    return 2 if violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
