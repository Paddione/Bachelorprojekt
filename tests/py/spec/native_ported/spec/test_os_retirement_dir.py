"""Native migration of tests/spec/os-retirement-dir.bats."""

import re
import subprocess

import pytest

EXACT_CI_LINE = "    name: Factory + OpenSpec + Guards"
GITLAB_ALLOWED = "archive/gitlab-ci:openspec/specs/ci-cd.md"

GIT_GREP_EXCLUDES = [
    ":!docs/superpowers", ":!docs/adr", ":!.agents/docs/reorg-phase2", ":!.agents/plans",
    ":!.agents/memory", ":!scripts/migrations", ":!**/CHANGELOG.md", ":!CHANGELOG.md",
    ":!docs/generated", ":!docs/code-quality/repo-index.json",
    ":!tests/spec/os-retirement-*.bats", ":!tests/fixtures/os-retirement",
    ":!tests/py/spec/native_ported/spec/test_os_retirement_*.py",
    ":!tests/fixtures/sf-retirement", ":!tests/spec/neovim-dashboard.bats",
    ":!tests/py/spec/native_ported/spec/test_neovim_dashboard.py",
    ":!.opencode/skills/code-graph-interpretation/evals/results-*",
    ":!docs/brain/corpus-freeze.json", ":!docs/brain/embed-eval-report.md",
    ":!tests/spec/p0min-freeze-embed.bats", ":!ml/qwen35-planner-9b",
    ":!tests/py/spec/native_ported/spec/test_p0min_freeze_embed.py",
]


def test_t900726_openspec_ist_nicht_mehr_getrackt(run_cmd, repo_root):
    result = run_cmd(["git", "-C", str(repo_root), "ls-files", "--", "openspec"])
    assert result.returncode == 0, result.output
    assert result.output == ""


def test_t900726_openspec_kommt_nur_noch_in_der_allowlist_vor(run_cmd, repo_root):
    listed = run_cmd(
        ["git", "-C", str(repo_root), "grep", "-l", "-i", "openspec", "--", ".", *GIT_GREP_EXCLUDES]
    )
    files = [f for f in listed.stdout.splitlines() if f]
    if not files:
        return

    offenders = []
    for path in files:
        if path == ".github/workflows/ci.yml":
            lines = run_cmd(
                ["git", "-C", str(repo_root), "grep", "-h", "-i", "openspec", "--", path]
            ).stdout.splitlines()
            if any(line != EXACT_CI_LINE for line in lines):
                offenders.append(f"{path}(ci-extra)")
        elif path == "docs/runbooks/gitlab-restore.md":
            lines = run_cmd(
                ["git", "-C", str(repo_root), "grep", "-h", "-i", "openspec", "--", path]
            ).stdout.splitlines()
            if any(not re.search(GITLAB_ALLOWED, line) for line in lines):
                offenders.append(f"{path}(restore-extra)")
        else:
            offenders.append(path)
    assert not offenders, "unerlaubte Verweise in: " + " ".join(offenders)
