"""Native assertions from tests/spec/ci-cd/taskfile-shebang-portability.bats."""

import re
import pytest

@pytest.fixture
def lines(repo_root):
    files = [repo_root / "Taskfile.yml", *(repo_root / "taskfiles").rglob("*")]
    return [line for file in files if file.is_file() for line in file.read_text().splitlines()]


def test_taskfile_command_scan_positive_anchor(lines):
    assert sum(bool(re.match(r"\s+-\s", line)) for line in lines) > 100


def test_runner_started_through_interpreter(lines):
    # [T901392] Der Test-Runner ist scripts/pytest-run.sh und wird ueber bash gestartet.
    assert any("bash scripts/pytest-run.sh" in line for line in lines)


def test_no_taskfile_shebang_invocation(lines):
    test_taskfile_command_scan_positive_anchor(lines)
    pattern = re.compile(r"(^|[;&|(]|&&|\|\|)\s*(-\s+)?\./(scripts|tests|tools)/")
    bad = [line for line in lines if pattern.search(line) and not re.match(r"\s*#", line) and not re.search(r"echo|printf", line)]
    assert not bad, bad
