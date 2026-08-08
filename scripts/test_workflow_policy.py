#!/usr/bin/env python3
from __future__ import annotations

import unittest

from workflow_policy import only_calls_reusable_workflows


class ReusableWorkflowPolicyTests(unittest.TestCase):
    def test_accepts_job_level_reusable_workflow_call(self) -> None:
        workflow = """jobs:
  call:
    name: portability
    strategy:
      matrix:
        os: [ubuntu-24.04, macos-15, windows-2025]
    uses: example/.github/.github/workflows/reusable.yml@0123456789012345678901234567890123456789
"""
        self.assertTrue(only_calls_reusable_workflows(workflow))

    def test_rejects_step_level_action_as_reusable_workflow_call(self) -> None:
        workflow = """jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@0123456789012345678901234567890123456789
"""
        self.assertFalse(only_calls_reusable_workflows(workflow))

    def test_rejects_mixed_reusable_and_runner_jobs(self) -> None:
        workflow = """jobs:
  call:
    uses: example/.github/.github/workflows/reusable.yml@0123456789012345678901234567890123456789
  test:
    runs-on: ubuntu-24.04
    steps:
      - run: echo test
"""
        self.assertFalse(only_calls_reusable_workflows(workflow))

    def test_accepts_nonstandard_consistent_indentation(self) -> None:
        workflow = """jobs:
    call:
        if: always()
        uses: example/.github/.github/workflows/reusable.yml@0123456789012345678901234567890123456789 # pinned
"""
        self.assertTrue(only_calls_reusable_workflows(workflow))

    def test_rejects_workflow_without_jobs(self) -> None:
        self.assertFalse(only_calls_reusable_workflows("name: no jobs\n"))


if __name__ == "__main__":
    unittest.main()
