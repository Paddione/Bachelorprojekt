"""Native assertions from tests/spec/ci-cd/bats-no-live-branch-assertion.bats."""

import re


def test_no_bats_reads_live_checkout_branch(repo_root):
    files = list((repo_root / "tests").rglob("*.bats"))
    assert len(files) > 100
    files = [file for file in files if file.name != "bats-no-live-branch-assertion.bats"]
    assert any(re.search(r'git\s+-C\s+"?\$(TMP|TR)', file.read_text()) for file in files)
    query = re.compile(r"rev-parse\s+--abbrev-ref\s+HEAD|branch\s+--show-current")
    quoted_grep = re.compile(r"grep\s+-[a-zA-Z]+\s+['\"].*git\s+(branch|rev-parse)\s+--")
    live = re.compile(r'git\s+-C\s+"?\$REPO_ROOT|git\s+(rev-parse|branch)\s+--')
    bad = [f"{file}:{i}" for file in files for i, line in enumerate(file.read_text().splitlines(), 1) if query.search(line) and not re.match(r"\s*#", line) and not quoted_grep.search(line) and live.search(line)]
    assert not bad, bad
