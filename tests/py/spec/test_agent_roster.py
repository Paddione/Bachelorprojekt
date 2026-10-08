"""Drift gates for agent registry (migrated from tests/spec/agent-roster.bats)."""

import json
import os
from pathlib import Path
import re
import subprocess
import pytest
import yaml


def _load_agents_yaml(repo_root: Path) -> dict:
    with open(repo_root / "docs" / "agent-guide" / "registry" / "agents.yaml") as f:
        return yaml.safe_load(f)


def test_p4_2_roles_claude_agents_bidirectional(repo_root: Path):
    reg = _load_agents_yaml(repo_root)
    roles = reg.get("roles", {})

    # Registry -> files
    missing = []
    for role in roles:
        agent_file = repo_root / ".claude" / "agents" / f"{role}.md"
        if not agent_file.is_file():
            missing.append(role)
    assert not missing, f"roles ohne .claude/agents/*.md: {missing}"

    # Files -> Registry
    agents_dir = repo_root / ".claude" / "agents"
    extra = []
    for f in list(agents_dir.glob("bachelorprojekt-*.md")) + list(agents_dir.glob("bp-*.md")):
        name = f.stem
        if name not in roles:
            extra.append(name)
    assert not extra, f".claude/agents/*.md ohne roles-Eintrag: {extra}"


def test_p4_4_claude_md_only_registry_agents(repo_root: Path):
    reg = _load_agents_yaml(repo_root)
    roles = set(reg.get("roles", {}).keys())
    runtimes = set(reg.get("runtimes", {}).keys())
    valid_agents = roles | runtimes

    claude_md = (repo_root / "CLAUDE.md").read_text()
    found_names = set(
        re.findall(
            r"bachelorprojekt-[a-z]+|gemma-4-12b(?:-primary)?|deepseek-helper|orchestrator",
            claude_md,
        )
    )
    bad = [name for name in found_names if name not in valid_agents]
    assert not bad, f"CLAUDE.md nennt Agenten nicht in Registry: {bad}"


def test_p4_5_agents_map_fresh(repo_root: Path, tmp_path: Path):
    script = repo_root / "scripts" / "agent-guide" / "emit-maps.mjs"
    env = {**os.environ, "AGENT_GUIDE_MAPS_OUT_DIR": str(tmp_path)}
    subprocess.run(["node", str(script)], cwd=repo_root, env=env, check=True)

    current_map = (repo_root / "docs" / "agent-guide" / "maps" / "agents-map.md").read_text()
    emitted_map = (tmp_path / "agents-map.md").read_text()
    assert current_map == emitted_map, "agents-map.md nicht aktuell — emit-maps.mjs erzeugt Diff"


def test_p4_6_no_tmp_leftovers(repo_root: Path):
    leftovers = list((repo_root / "docs" / "agent-guide" / "maps").glob("*.tmp"))
    assert not leftovers, f"tmp-Reste gefunden: {leftovers}"
