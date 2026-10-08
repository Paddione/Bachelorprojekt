"""Native migration of tests/spec/agent-skills/devflow-worktree-cwd-guard.bats."""

import pytest

# Alle dev-flow-Skill-Dateien, die bare git-Aufrufe enthalten (T006367).
AFFECTED_FILES = [
    ".claude/skills/dev-flow-plan/SKILL.md",
    ".claude/skills/references/dev-flow-plan-phases.md",
    ".claude/skills/dev-flow-execute/SKILL.md",
    ".claude/skills/dev-flow-chore/SKILL.md",
    ".opencode/skills/dev-flow-plan/SKILL.md",
    ".opencode/skills/dev-flow-execute/SKILL.md",
    ".opencode/skills/dev-flow-chore/SKILL.md",
]


def _check_phrase(repo_root, phrase, label):
    missing = []
    for rel in AFFECTED_FILES:
        path = repo_root / rel
        if not path.is_file():
            missing.append(f"FEHLT-DATEI: {rel}")
            continue
        if phrase not in path.read_text(encoding="utf-8"):
            missing.append(f"FEHLT-{label}: {rel}")
    assert not missing, "\n".join(missing)


def test_t006367_jede_dev_flow_skill_datei_traegt_die_regel_phrase(repo_root):
    _check_phrase(repo_root, "nie auf implizites cwd vertrauen", "PHRASE")


def test_t006367_jede_dev_flow_skill_datei_nennt_die_pflichtform_git_c(repo_root):
    _check_phrase(repo_root, "git -C", "FORM")
