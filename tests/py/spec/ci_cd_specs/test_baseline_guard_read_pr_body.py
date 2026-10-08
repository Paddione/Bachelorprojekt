"""Native assertions from tests/spec/ci-cd/baseline-guard-read-pr-body.bats."""

import re

def test_read_pr_body_fallback_and_hard_fail(repo_root):
    source = (repo_root / "scripts/code-quality/baseline-key-count-assertion.mjs").read_text()
    assert "process.env.GITHUB_EVENT_PATH" in source
    assert re.search(r"process\.exit\(1\)|throw new Error", source)
