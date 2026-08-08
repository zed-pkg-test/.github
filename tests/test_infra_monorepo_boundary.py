from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "check_infra_monorepo_boundary.py"
SPEC = importlib.util.spec_from_file_location("boundary", SCRIPT)
assert SPEC and SPEC.loader
boundary = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = boundary
SPEC.loader.exec_module(boundary)


class BoundaryTests(unittest.TestCase):
    def fixture(self, name: str) -> Path:
        return ROOT / "tests" / "fixtures" / name / ".gitmodules"

    def test_clean_manifest_passes(self) -> None:
        report = boundary.build_report("example/app-monorepo", self.fixture("clean"))
        self.assertTrue(report["applicable"])
        self.assertEqual(report["checked_submodules"], 2)
        self.assertEqual(report["violations"], [])

    def test_missing_manifest_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report = boundary.build_report(
                "example/app-monorepo", Path(directory) / ".gitmodules"
            )
        self.assertEqual(report["checked_submodules"], 0)
        self.assertEqual(report["violations"], [])

    def test_non_monorepo_is_not_applicable(self) -> None:
        report = boundary.build_report("example/app-infra", self.fixture("hyphen-infra"))
        self.assertFalse(report["applicable"])
        self.assertEqual(report["violations"], [])

    def test_hyphen_infra_is_rejected(self) -> None:
        report = boundary.build_report("example/app-monorepo", self.fixture("hyphen-infra"))
        self.assertEqual(len(report["violations"]), 1)
        self.assertEqual(report["violations"][0]["repository_name"], "app-infra")

    def test_dotted_infra_is_rejected(self) -> None:
        report = boundary.build_report("example/app-monorepo", self.fixture("dotted-infra"))
        self.assertEqual(len(report["violations"]), 1)
        self.assertEqual(report["violations"][0]["repository_name"], "app.infra")

    def test_url_catches_generic_path_alias(self) -> None:
        report = boundary.build_report("example/app-monorepo", self.fixture("url-only-infra"))
        self.assertEqual(len(report["violations"]), 1)
        reasons = report["violations"][0]["reasons"]
        self.assertTrue(any("URL targets" in reason for reason in reasons))

    def test_infra_outside_apps_is_still_rejected(self) -> None:
        report = boundary.build_report(
            "example/app-monorepo", self.fixture("outside-apps-infra")
        )
        self.assertEqual(len(report["violations"]), 1)
        self.assertEqual(report["violations"][0]["path"], "deploy/app-infra")

    def test_infrared_repository_is_not_a_false_positive(self) -> None:
        module = boundary.Submodule(
            section='submodule "apps/infrared-ui"',
            path="apps/infrared-ui",
            url="https://github.com/example/infrared-ui.git",
        )
        self.assertEqual(boundary.find_violations([module]), [])

    def test_json_cli_reports_policy_and_exit_two(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                str(self.fixture("hyphen-infra")),
                "--repository",
                "example/app-monorepo",
                "--json",
            ],
            check=False,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 2)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["policy_id"], boundary.POLICY_ID)
        self.assertEqual(len(payload["violations"]), 1)


if __name__ == "__main__":
    unittest.main()
