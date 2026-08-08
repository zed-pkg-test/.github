#!/usr/bin/env python3
"""Keyless structural checks for a Zed package dependency manifest.

This is intentionally the per-repository slice of DEN-2058. Cross-repository
cycle resolution, producer publication checks, frozen installs, and scheduled
fleet inventory belong to later gates that have network/fleet context.
"""
from __future__ import annotations

import argparse
import re
import sys
import tempfile
import tomllib
from pathlib import Path
from urllib.parse import urlparse

IDENTITY = re.compile(r"^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$")


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def validate(path: Path, expected_repo: str | None = None) -> list[str]:
    errors: list[str] = []
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:
        return [f"cannot read valid TOML from {path}: {exc}"]

    package = data.get("package")
    if not isinstance(package, dict):
        return ["[package] table is required"]

    org = package.get("org")
    name = package.get("name")
    if not isinstance(org, str) or not org:
        fail(errors, "package.org must be a non-empty string")
    if not isinstance(name, str) or not name:
        fail(errors, "package.name must be a non-empty string")
    identity = f"{org}/{name}" if isinstance(org, str) and isinstance(name, str) else None
    if identity and not IDENTITY.fullmatch(identity):
        fail(errors, "package identity must be a lowercase org/name token")

    repository = package.get("repository", {})
    if repository and not isinstance(repository, dict):
        fail(errors, "package.repository must be a table")
    elif isinstance(repository, dict):
        url = repository.get("url")
        if url is not None:
            if not isinstance(url, str):
                fail(errors, "package.repository.url must be a string")
            else:
                parsed = urlparse(url)
                if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
                    fail(errors, "package.repository.url must be an https://github.com URL")
                elif parsed.username or parsed.password or parsed.query or parsed.fragment:
                    fail(errors, "package.repository.url must not contain credentials, query, or fragment")
                else:
                    repo_identity = parsed.path.strip("/")
                    if expected_repo and repo_identity.lower() != expected_repo.lower():
                        fail(errors, "package.repository.url does not match the repository under test")
                    if identity and repo_identity.lower() != identity.lower():
                        fail(errors, "package.repository.url does not match package org/name")

    dependencies = data.get("dependencies", {})
    if not isinstance(dependencies, dict):
        fail(errors, "[dependencies] must be a table")
        return errors

    normalized: set[str] = set()
    for raw_identity, requirement in dependencies.items():
        if not isinstance(raw_identity, str) or not IDENTITY.fullmatch(raw_identity):
            fail(errors, "every dependency key must be a lowercase org/name identity")
            continue
        canonical = raw_identity.lower()
        if canonical in normalized:
            fail(errors, f"duplicate dependency identity after normalization: {canonical}")
        normalized.add(canonical)
        if identity and canonical == identity.lower():
            fail(errors, "package must not depend on itself")
        if not isinstance(requirement, str) or not requirement.strip():
            fail(errors, f"dependency {canonical} must have a non-empty requirement")

    install = data.get("install", {})
    if install and not isinstance(install, dict):
        fail(errors, "[install] must be a table")
    elif isinstance(install, dict) and "dir" in install:
        install_dir = install["dir"]
        if not isinstance(install_dir, str) or not install_dir:
            fail(errors, "install.dir must be a non-empty string")
        elif Path(install_dir).is_absolute() or ".." in Path(install_dir).parts:
            fail(errors, "install.dir must remain inside the repository")

    return errors


def self_test() -> int:
    cases = {
        "valid": ("""
[package]
org = "zed-pkg-test"
name = "consumer"
[package.repository]
vcs = "git"
url = "https://github.com/zed-pkg-test/consumer"
[dependencies]
"zed-pkg-test/producer" = "^1.0.0"
[install]
dir = ".vendor/.zed"
""", False),
        "self-edge": ("""
[package]
org = "zed-pkg-test"
name = "consumer"
[dependencies]
"zed-pkg-test/consumer" = "^1.0.0"
""", True),
        "bad-producer": ("""
[package]
org = "zed-pkg-test"
name = "consumer"
[dependencies]
"../producer" = "^1.0.0"
""", True),
        "repo-mismatch": ("""
[package]
org = "zed-pkg-test"
name = "consumer"
[package.repository]
url = "https://github.com/zed-pkg-test/other"
""", True),
        "repo-credential": ("""
[package]
org = "zed-pkg-test"
name = "consumer"
[package.repository]
url = "https://user:secret@github.com/zed-pkg-test/consumer"
""", True),
        "escape-install": ("""
[package]
org = "zed-pkg-test"
name = "consumer"
[install]
dir = "../outside"
""", True),
    }
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        for name, (content, should_fail) in cases.items():
            path = root / f"{name}.toml"
            path.write_text(content.strip() + "\n", encoding="utf-8")
            errors = validate(path, "zed-pkg-test/consumer")
            if bool(errors) != should_fail:
                print(f"self-test {name}: expected fail={should_fail}, got {errors}", file=sys.stderr)
                return 1
    print(f"topology validator self-test: {len(cases)} cases passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", nargs="?", default=".zpkg.toml")
    parser.add_argument("--repository", help="expected GitHub owner/name")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    errors = validate(Path(args.manifest), args.repository)
    if errors:
        print("Zed dependency topology validation failed:", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1
    print("Zed dependency topology structural checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
