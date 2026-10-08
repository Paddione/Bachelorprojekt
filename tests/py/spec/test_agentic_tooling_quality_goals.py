"""Tests for agentic tooling quality goals (migrated from tests/spec/agentic-tooling-quality-goals.bats)."""

from pathlib import Path
import re
import subprocess
import pytest


def test_g_agentic03_frontmatter_completeness(repo_root: Path):
    agents_dir = repo_root / ".claude" / "agents"
    bp_files = list(agents_dir.glob("bp-*.md"))
    assert len(bp_files) > 0

    for f in bp_files:
        content = f.read_text()
        assert "name:" in content, f"MISSING name: in {f.name}"
        assert "description:" in content, f"MISSING description: in {f.name}"

        base = f.stem
        name_val = re.search(r"^name:\s*(.+)$", content, re.M).group(1).strip()
        assert name_val == base, f"MISMATCH in {f.name}: name={name_val}, expected {base}"


def test_g_agentic02_routing_table(repo_root: Path):
    agents_md = (repo_root / "AGENTS.md").read_text()
    for agent in ["bp-build", "bp-run", "bp-ship"]:
        assert agent in agents_md, f"AGENTS.md missing routing entry for {agent}"


def test_g_agentic04_test_changed_agent_library(repo_root: Path):
    test_yml = (repo_root / "taskfiles" / "Taskfile.test.yml").read_text()
    assert "agent-library" in test_yml


def test_g_agentic05_three_agent_files(repo_root: Path):
    agents_dir = repo_root / ".claude" / "agents"
    count = len(list(agents_dir.glob("bp-*.md")))
    assert count == 3


def test_g_agentic09_limits(repo_root: Path):
    goals_script = (repo_root / "scripts" / "health-goals-check.sh").read_text()
    assert "row gate G-AGENTIC09 " in goals_script
    assert "-gt 400" in goals_script
    assert "-gt 500" not in goals_script
    assert "vendor-skills:begin" in goals_script
