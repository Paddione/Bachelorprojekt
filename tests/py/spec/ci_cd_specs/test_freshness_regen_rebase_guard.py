"""Native assertions from tests/spec/ci-cd/freshness-regen-rebase-guard.bats."""

import re


def section(repo_root, number):
    source = (repo_root / ".claude/skills/git-workflow/SKILL.md").read_text()
    match = re.search(r"^## Schritt " + str(number) + r".*?(?=^## Schritt [0-9]|\Z)", source, re.M | re.S)
    assert match
    return match[0]


def test_pull_first_control_anchor(repo_root):
    assert "git pull --rebase origin main" in section(repo_root, 0)


def test_rebase_check_before_regeneration(repo_root):
    block = section(repo_root, 1)
    assert "freshness:regenerate" in block
    before = block.split("freshness:regenerate", 1)[0]
    assert re.search(r"rev-list\s+--count\s+HEAD\.\.origin/main", before)
    assert "rebas" in before.lower()
