"""Native migration of tests/spec/agent-skills/skill-symlink-targets.bats."""

import os
import re
import subprocess

import pytest


def _core_symlinks_false(repo_root):
    """git config --bool core.symlinks == false -> alle Tests skippen (setup-Verhalten)."""
    r = subprocess.run(
        ["git", "-C", str(repo_root), "config", "--bool", "core.symlinks"],
        capture_output=True, text=True,
    )
    return r.stdout.strip() == "false"


@pytest.fixture(autouse=True)
def _symlink_capable(repo_root):
    if _core_symlinks_false(repo_root):
        pytest.skip("core.symlinks=false — Symlink-Assertions uebersprungen")


@pytest.fixture
def skill_dir(repo_root):
    return repo_root / ".claude/skills"


def _symlinks(skill_dir):
    """find <skill_dir> -maxdepth 1 -type l | sort"""
    if not skill_dir.is_dir():
        return []
    return sorted(str(p) for p in skill_dir.iterdir() if os.path.islink(p))


def _excluded_from_claude(repo_root):
    """awk-Nachbau: Skill-IDs mit claude_code-Exklusion in skills.yaml."""
    out = []
    sid = ""
    excl = False
    in_excl = False
    for line in (repo_root / "docs/agent-guide/registry/skills.yaml").read_text(encoding="utf-8").splitlines():
        if line.startswith("  - id: "):
            if sid and excl:
                out.append(sid)
            fields = line.split()
            sid = fields[2] if len(fields) > 2 else ""
            excl = False
            in_excl = False
            continue
        if line == "    exclusions:":
            in_excl = True
            continue
        if re.match(r"^    [a-z]", line):
            in_excl = False
        if in_excl and line.startswith("      claude_code:"):
            excl = True
    if sid and excl:
        out.append(sid)
    return out


def _expected_symlink_names(run_cmd, repo_root):
    """Soll-Menge: getrackte .opencode/skills/*/SKILL.md-Verzeichnisse plus OVERVIEW.md, minus Exklusionen."""
    ls = run_cmd(["git", "-C", str(repo_root), "ls-files", "--", ".opencode/skills"]).stdout.splitlines()
    names = set()
    for path in ls:
        if path.endswith("/SKILL.md"):
            names.add(path[len(".opencode/skills/"):-len("/SKILL.md")] if path.startswith(".opencode/skills/") else path)
    names.add("OVERVIEW.md")
    return sorted(names - set(_excluded_from_claude(repo_root)))


def test_t900236_claude_skills_symlinks_entsprechen_den_getrackten_skills(run_cmd, repo_root, skill_dir):
    # Positiv-Anker: Verzeichnis existiert und enthaelt Symlinks.
    assert skill_dir.is_dir()
    links = _symlinks(skill_dir)
    assert len(links) > 0

    # Soll-Ist-Abgleich: fehlende UND ueberzaehlige Symlinks faerben rot.
    expected = _expected_symlink_names(run_cmd, repo_root)
    actual = sorted(os.path.basename(p) for p in links)
    assert expected == actual, (
        f"fehlend: {sorted(set(expected) - set(actual))}\nueberzaehlig: {sorted(set(actual) - set(expected))}"
    )


def test_t900236_jeder_claude_skills_symlink_loest_auf_ein_existierendes_ziel_auf(skill_dir):
    assert skill_dir.is_dir()
    links = _symlinks(skill_dir)
    assert links
    broken = []
    for link in links:
        if not os.path.exists(link):
            broken.append(f"{link} -> {os.readlink(link)}")
    assert not broken, "Kaputte Symlinks:\n" + "\n".join(broken)


def test_t900236_jeder_verlinkte_skill_traegt_eine_lesbare_skill_md(skill_dir):
    assert skill_dir.is_dir()
    links = _symlinks(skill_dir)
    assert links
    missing = []
    non_dir = []
    for link in links:
        if not os.path.isdir(link):
            # T900238 (F1): einzig OVERVIEW.md darf ein Nicht-Verzeichnis-Ziel sein.
            if os.path.basename(link) == "OVERVIEW.md":
                continue
            non_dir.append(f"{link} -> {os.readlink(link)}")
            continue
        if not os.access(os.path.join(link, "SKILL.md"), os.R_OK):
            missing.append(os.path.join(link, "SKILL.md"))
    assert not non_dir, "Symlinks auf Nicht-Verzeichnis-Ziele:\n" + "\n".join(non_dir)
    assert not missing, "Fehlende SKILL.md:\n" + "\n".join(missing)


