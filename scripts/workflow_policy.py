#!/usr/bin/env python3
from __future__ import annotations

import re

_JOB_HEADER = re.compile(
    r"^(?P<indent> +)(?P<job_id>[A-Za-z_][A-Za-z0-9_-]*):\s*(?:#.*)?$"
)
_REUSABLE_CALL = re.compile(r"^uses:\s*[^\s#]+(?:\s+#.*)?$")


def _leading_spaces(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _job_blocks(workflow: str) -> list[tuple[int, list[str]]]:
    lines = workflow.splitlines()
    jobs_index = next(
        (
            index
            for index, line in enumerate(lines)
            if re.fullmatch(r"jobs:\s*(?:#.*)?", line)
        ),
        None,
    )
    if jobs_index is None:
        return []

    blocks: list[tuple[int, list[str]]] = []
    current: list[str] = []
    job_indent: int | None = None

    for line in lines[jobs_index + 1 :]:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and _leading_spaces(line) == 0:
            break

        match = _JOB_HEADER.fullmatch(line)
        if match:
            indent = len(match.group("indent"))
            if job_indent is None:
                job_indent = indent
            if indent == job_indent:
                if current:
                    blocks.append((job_indent, current))
                current = [line]
                continue

        if current:
            current.append(line)

    if current and job_indent is not None:
        blocks.append((job_indent, current))
    return blocks


def _is_reusable_workflow_job(job_indent: int, block: list[str]) -> bool:
    properties: list[tuple[int, str]] = []
    for line in block[1:]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = _leading_spaces(line)
        if indent > job_indent:
            properties.append((indent, stripped))

    if not properties:
        return False

    property_indent = min(indent for indent, _ in properties)
    return any(
        indent == property_indent and _REUSABLE_CALL.fullmatch(stripped)
        for indent, stripped in properties
    )


def only_calls_reusable_workflows(workflow: str) -> bool:
    """Return true when every job is a job-level reusable-workflow call.

    GitHub does not permit ``timeout-minutes`` on jobs that use the reusable
    workflow calling syntax. The called workflow owns the executable jobs and
    therefore owns their timeout policy.
    """

    blocks = _job_blocks(workflow)
    return bool(blocks) and all(
        _is_reusable_workflow_job(job_indent, block)
        for job_indent, block in blocks
    )
