"""Guard from tests/spec/ci-cd/bats-no-live-branch-assertion.bats, retargeted to pytest modules [T901392].

No test may assert on the branch of the live checkout (it differs per worktree and in CI).
Branch queries belong in a temporary repository (`git -C <tmp_path>`)."""

import re

QUERY = re.compile(r"rev-parse['\",\s]+--abbrev-ref['\",\s]+HEAD|branch['\",\s]+--show-current")
LIVE = re.compile(r"repo_root|REPO_ROOT")


def test_no_test_reads_live_checkout_branch(repo_root):
    files = [f for f in (repo_root / "tests/py").rglob("test_*.py") if f.name != "test_bats_no_live_branch_assertion.py"]
    assert len(files) > 100
    # Positive anchor: branch queries against temporary repositories exist.
    assert any(QUERY.search(f.read_text()) and "tmp_path" in f.read_text() for f in files)
    bad = [
        f"{f.relative_to(repo_root)}:{i}"
        for f in files
        for i, line in enumerate(f.read_text().splitlines(), 1)
        if QUERY.search(line) and LIVE.search(line) and not line.lstrip().startswith("#")
    ]
    assert not bad, bad
