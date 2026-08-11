#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import re
import unittest


REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOW_PATH = REPOSITORY_ROOT / ".github/workflows/sdk-client-language-matrix.yml"


class SdkClientLanguageMatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    def matrix_entry(self, language_id: str) -> str:
        match = re.search(
            rf"^          - id: {re.escape(language_id)}\n(?P<body>.*?)(?=^          - id: |^    steps:)",
            self.workflow,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertIsNotNone(match, f"missing {language_id} matrix entry")
        return match.group(0)

    def test_upstream_checkout_recurses_public_source_submodules(self) -> None:
        match = re.search(
            r"^      - name: Check out the upstream clients repository\n(?P<body>.*?)(?=^      - name: )",
            self.workflow,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertIsNotNone(match, "missing upstream clients checkout")
        checkout = match.group(0)
        self.assertIn("          submodules: recursive\n", checkout)
        self.assertIn("          persist-credentials: false\n", checkout)

    def test_java_prefers_native_tests_and_keeps_maven_on_jdk17(self) -> None:
        java = self.matrix_entry("java")
        self.assertIn("            image: maven:3.9-eclipse-temurin-17\n", java)
        self.assertIn(
            "if [ -x ./test.sh ]; then ./test.sh;",
            java,
        )
        self.assertIn("elif [ -f pom.xml ]; then mvn -B test;", java)
        self.assertIn("elif [ -x ./gradlew ]; then ./gradlew --no-daemon test;", java)

    def test_deno_uses_an_existing_official_image_tag(self) -> None:
        deno = self.matrix_entry("typescript-deno")
        self.assertIn("            image: denoland/deno:2.9.5\n", deno)
        self.assertNotIn("            image: denoland/deno:2\n", deno)

    def test_kotlin_remains_on_the_required_jdk17_toolchain(self) -> None:
        kotlin = self.matrix_entry("kotlin")
        self.assertIn("            image: gradle:8-jdk17\n", kotlin)
        self.assertNotIn("jdk21", kotlin)

    def test_swift_builds_packages_without_requiring_a_test_target(self) -> None:
        swift = self.matrix_entry("swift")
        self.assertIn("swift build &&", swift)
        self.assertIn("if [ -d Tests ]; then swift test; fi", swift)


if __name__ == "__main__":
    unittest.main()
