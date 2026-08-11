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

    def native_toolchain_step(self) -> str:
        match = re.search(
            r"^      - name: Compile and test the SDK in its native toolchain\n(?P<body>.*?)(?=^      - name: |\Z)",
            self.workflow,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertIsNotNone(match, "missing native toolchain step")
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

    def test_dart_builds_the_product_native_core_before_tests(self) -> None:
        dart = self.matrix_entry("dart")
        self.assertIn("if [ -x ./test.sh ]; then ./test.sh; else", dart)
        self.assertIn("../../syncer.c/core/CMakeLists.txt", dart)
        self.assertIn("cmake --build ../../syncer.c/core/build --target syncer", dart)
        self.assertIn("export SYNCER_LIB_PATH=", dart)
        self.assertIn("dart analyze", dart)
        self.assertIn("dart test", dart)

    def test_gleam_builds_the_product_beam_nif_before_tests(self) -> None:
        gleam = self.matrix_entry("gleamlang")
        self.assertIn(
            "            image: ghcr.io/gleam-lang/gleam:v1.15.2-elixir\n",
            gleam,
        )
        self.assertIn("../../syncer.c/bindings/beam/mix.exs", gleam)
        self.assertIn("mix compile", gleam)
        self.assertIn("export OPTO_SYNC_BEAM_EBIN=", gleam)
        self.assertIn("export OPTO_SYNC_ELIXIR_EBIN=", gleam)
        self.assertIn("gleam test", gleam)
        self.assertNotIn("apt-get install", gleam)
        self.assertNotIn(" cargo ", gleam)

    def test_gleam_prefers_the_source_owned_pinned_beam_image(self) -> None:
        step = self.native_toolchain_step()
        self.assertIn("          LANGUAGE_ID: ${{ matrix.id }}\n", step)
        self.assertIn(
            'beam_dockerfile="_upstream/syncer.c/bindings/beam/Dockerfile.test"',
            step,
        )
        self.assertIn(
            'if [[ "$LANGUAGE_ID" == "gleamlang" && -f "$beam_dockerfile" ]]; then',
            step,
        )
        self.assertIn('x86_64) target_arch="amd64" ;;', step)
        self.assertIn('aarch64|arm64) target_arch="arm64" ;;', step)
        self.assertIn('runtime_image="opto-sync-beam-test:local"', step)
        self.assertIn('--build-arg "TARGETARCH=$target_arch"', step)
        self.assertIn('--file "$beam_dockerfile"', step)
        self.assertIn('"$(dirname "$beam_dockerfile")"', step)

    def test_generic_consumers_pull_the_declared_matrix_image(self) -> None:
        step = self.native_toolchain_step()
        self.assertIn('runtime_image="$SDK_IMAGE"', step)
        self.assertIn('else\n            docker pull "$runtime_image"\n          fi', step)
        self.assertIn('            "$runtime_image" \\\n', step)

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
