"""Tests for agent skills quality and root instructions (migrated from tests/spec/agent-skills.bats)."""

import os
from pathlib import Path
import re
import subprocess
import pytest
import yaml


def test_dev_flow_chore_and_ticket_ops_skills(repo_root: Path):
    chore_skill = repo_root / ".claude" / "skills" / "dev-flow-chore" / "SKILL.md"
    ticket_skill = repo_root / ".claude" / "skills" / "ticket-ops" / "SKILL.md"
    assert chore_skill.is_file()
    assert ticket_skill.is_file()

    assert re.search(r"Secret-in-index-Guard|secret.*index.*guard|git-crypt", chore_skill.read_text())
    assert not re.search(r"^\s*git add -A\s*$", chore_skill.read_text(), re.M)
    assert re.search(r"dedup|duplicate|same.*title|vorhanden.*Ticket", ticket_skill.read_text(), re.I)

    agent_push = repo_root / "scripts" / "agent-push.sh"
    assert agent_push.is_file()
    assert os.access(agent_push, os.X_OK)
    assert "bachelorprojekt-" in agent_push.read_text()


def _vendor_skills(repo_root: Path) -> set[str]:
    cmd = (
        "sed -n '/<!-- vendor-skills:begin -->/,/<!-- vendor-skills:end -->/p' "
        ".opencode/skills/OVERVIEW.md | grep -oE '^\\| `[a-z0-9/-]+`' | tr -d '|` ' | sort -u"
    )
    res = subprocess.run(["bash", "-c", cmd], cwd=repo_root, capture_output=True, text=True, check=True)
    return set(res.stdout.split())


def _project_owned_skills(repo_root: Path) -> list[str]:
    vendor = _vendor_skills(repo_root)
    skills_dir = repo_root / ".opencode" / "skills"
    res = subprocess.run(
        ["git", "ls-files", "--", ".opencode/skills"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    )
    owned = []
    for line in res.stdout.splitlines():
        if line.endswith("/SKILL.md"):
            slug = line.replace(".opencode/skills/", "").replace("/SKILL.md", "")
            if slug not in vendor:
                owned.append(slug)
    return owned


def test_overview_vendor_skills(repo_root: Path):
    vendors = _vendor_skills(repo_root)
    assert len(vendors) > 0
    for v in vendors:
        assert (repo_root / ".opencode" / "skills" / v).is_dir(), f"vendor skill without dir: {v}"


def test_project_owned_skills_quality(repo_root: Path):
    owned = _project_owned_skills(repo_root)
    assert len(owned) > 0

    goals_script = (repo_root / "scripts" / "health-goals-check.sh").read_text()
    limit_match = re.search(r'row gate G-AGENTIC09 .*?SKILL\.md"\)" -gt ([0-9]+)', goals_script, re.S)
    limit = int(limit_match.group(1)) if limit_match else 400

    for slug in owned:
        skill_file = repo_root / ".opencode" / "skills" / slug / "SKILL.md"
        content = skill_file.read_text()
        line_count = len(content.splitlines())
        assert line_count <= limit, f"{slug} has {line_count} lines (limit {limit})"

        # frontmatter check
        if content.startswith("---"):
            fm_text = content.split("---", 2)[1]
            data = yaml.safe_load(fm_text)
            if not data.get("archived", False):
                assert "description" in data, f"No description in {slug}"
                assert "name" in data, f"No name in {slug}"


def test_t002305_root_instruction_files(repo_root: Path):
    for f in ["CLAUDE.md", "AGENTS.md", "GEMINI.md"]:
        content = (repo_root / f).read_text()
        assert "keycloak" not in content.lower(), f"{f} mentions Keycloak"

    gemini = (repo_root / "GEMINI.md").read_text()
    tasks = re.findall(r"task [a-z][a-z0-9-]*:[a-z0-9:-]*", gemini)
    tasks = [t for t in tasks if t not in ["task mcp:sync", "task mcp:check"]]
    assert not tasks, f"Unerlaubte task-Literale in GEMINI.md: {tasks}"
    assert not re.search(r"Nextcloud|Vaultwarden|Collabora|DocuSeal|Janus|coturn|Traefik|LiveKit", gemini)
