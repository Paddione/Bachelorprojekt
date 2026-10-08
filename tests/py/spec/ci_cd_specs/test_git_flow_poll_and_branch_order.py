"""Native assertions from tests/spec/ci-cd/git-flow-poll-and-branch-order.bats."""

import re

def test_fix_pr_merges_keep_branch_until_finalizer(run_cmd):
    anchor = run_cmd(["git", "ls-files", "scripts", ".claude/skills", ".opencode/skills"])
    anchor.check()
    assert anchor.output
    result = run_cmd(["git", "grep", "-E", "-n", r"pr merge[^#`]*--delete-branch", "--", ".claude/skills", ".opencode/skills", "scripts"])
    assert result.returncode == 1, result.output


def test_gh_axi_reference_documents_json_polling_rule(repo_root):
    source = (repo_root / ".claude/skills/references/gh-axi.md").read_text()
    assert "maschinell weiterverarbeitet" in source
    assert re.search("ignoriert.*--json.*still", source)
