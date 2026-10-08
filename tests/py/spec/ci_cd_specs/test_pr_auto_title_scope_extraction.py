"""Native assertions from tests/spec/ci-cd/pr-auto-title-scope-extraction.bats."""

import re
import subprocess
import pytest


def test_workflow_derives_scope(repo_root):
    assert "SCOPE=" in (repo_root / ".github/workflows/pr-auto-title.yml").read_text()

@pytest.mark.parametrize(("slug", "scope"), [("qwen38-primary-T900094", "qwen38"), ("g-fe03-structured-logger", "fe03")])
def test_sed_extracts_category_and_discards_g_prefix(slug, scope):
    result = subprocess.run(["sed", "-nE", r"s/^(g-)?([a-z]{1,4}[0-9]{2,3})-.*/\2/p"], input=slug, text=True, capture_output=True, timeout=60)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == scope


def test_no_workflow_uses_nonexistent_sed_p_flag(repo_root):
    result = subprocess.run(["sed", "-nP", "s/x/y/p"], input="x", text=True, capture_output=True, timeout=60)
    assert result.returncode != 0
    workflows = list((repo_root / ".github/workflows").rglob("*"))
    assert any(file.is_file() for file in workflows)
    bad = [file for file in workflows if file.is_file() and re.search(r"sed\s+-[a-zA-Z]*P", file.read_text())]
    assert not bad, bad
