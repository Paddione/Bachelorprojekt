"""Native migration of tests/spec/ci-cd/changed-tests-env-hermetic.bats."""

import re
from pathlib import Path

import pytest


def _awk_seam(taskfile: Path) -> str:
    """awk '/^  test:spec:changed:/{f=1} f' | awk '<unset>/<bats-aufruf>' Naht-Pruefung."""
    lines, started = [], False
    for ln in taskfile.read_text().splitlines():
        if not started and re.match(r"^  test:spec:changed:", ln):
            started = True
        if started:
            lines.append(ln)
    u = b = 0
    for nr, ln in enumerate(lines, start=1):
        if "unset FIND_CHANGED_TESTS_FILES" in ln:
            u = nr
        if re.search(r"tests/bats|bats-core/bin/bats", ln) and not b:
            b = nr
    return "OK" if (u and b and u < b) else f"FAIL u={u} b={b}"


def test_t003056_ci_cd_bats_guards_bleiben_gruen_mit_gesetztem_find_changed_tests_files(repo_root):
    # Der Lauf ueber den bats-Runner (ci-cd.bats mit --filter) ist nicht portierbar:
    # Regel 5 verbietet den bats-Aufruf im Python-Port.
    pytest.skip("nicht portierbar: erfordert den bats-Runner (Regel 5)")


def test_t003056_test_spec_changed_gibt_die_variable_nicht_an_bats_weiter(repo_root):
    result = _awk_seam(repo_root / "taskfiles/Taskfile.test.yml")
    assert result == "OK"
