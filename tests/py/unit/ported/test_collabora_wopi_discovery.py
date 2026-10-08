"""Native migration of tests/unit/collabora-wopi-discovery.bats.

T000478. Pure static analysis, no cluster required.
"""
import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root):
    return {
        "root": repo_root / "Taskfile.yml",
        "suite": repo_root / "taskfiles",
        "manifest": repo_root / "k3d" / "office-stack" / "collabora.yaml",
    }


def _suite_lines(paths):
    """All lines of the Taskfile root plus every file under taskfiles/."""
    lines = []
    files = [paths["root"]]
    if paths["suite"].is_dir():
        files += sorted(p for p in paths["suite"].rglob("*") if p.is_file())
    for f in files:
        try:
            lines += f.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
    return lines


def _suite_count(paths, pattern):
    """Port of suite_count(): matching lines across the Taskfile suite."""
    rx = re.compile(pattern)
    return sum(1 for line in _suite_lines(paths) if rx.search(line))


def test_office_deploy_does_not_hardcode_collabora_server_name_to_a_brand_host(paths):
    rx = re.compile(r'export\s+COLLABORA_SERVER_NAME="office\.\$\{PROD_DOMAIN\}"')
    hits = [line for line in _suite_lines(paths) if rx.search(line)]
    assert not hits, "Found hardcoded COLLABORA_SERVER_NAME=office.${PROD_DOMAIN}:\n" + "\n".join(hits)


def test_office_deploy_exports_an_empty_collabora_server_name_for_dynamic_host_resolution(paths):
    assert _suite_count(paths, r'export\s+COLLABORA_SERVER_NAME=""') >= 1


def test_every_collabora_server_name_assignment_in_taskfile_is_the_empty_form(paths):
    total = _suite_count(paths, r"export\s+COLLABORA_SERVER_NAME=")
    empty = _suite_count(paths, r'export\s+COLLABORA_SERVER_NAME=""')
    assert total >= 1
    assert total == empty


def test_collabora_manifest_still_wires_server_name_from_collabora_server_name(paths):
    rx = re.compile(r'value:\s*"\$\{COLLABORA_SERVER_NAME\}"')
    lines = paths["manifest"].read_text(encoding="utf-8").splitlines()
    assert any(rx.search(line) for line in lines)
