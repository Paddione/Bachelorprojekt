"""Native assertions from tests/spec/ci-cd/fetch-refspec-forced.bats."""

import re
import pytest

@pytest.fixture
def lines(repo_root):
    return [line for file in (repo_root / ".github/workflows").rglob("*") if file.is_file() for line in file.read_text().splitlines()]


def test_origin_main_refspec_force_updated(lines):
    assert any("main:refs/remotes/origin/main" in line for line in lines)
    matches = [match[0] for line in lines for match in re.finditer(r".main:refs/remotes/origin/main", line)]
    assert not [match for match in matches if not match.startswith("+")]


def test_origin_main_fetch_not_pruned(lines):
    candidates = [line for line in lines if re.search(r"git fetch .*main:refs/remotes/origin/main", line)]
    assert candidates
    assert not [line for line in candidates if "--prune" in line]
