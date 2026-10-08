"""Native migration of tests/spec/dev-flow-plan/guard-parity.bats."""
# Pruefmodus: grep on source text (documented exception T002448-M4): the object under test
# is a documentation convention (guard presence in skill prose).

# The BATS original used yq; this port reads the registry with PyYAML (yaml_load fixture).

import re
from pathlib import Path

import pytest


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""


def test_jeder_guard_anker_kommt_in_jeder_applies_to_datei_vor(repo_root, yaml_load):
    registry = repo_root / "docs/agent-guide/registry/plan-guards.yaml"
    if not registry.is_file():
        pytest.skip("plan-guards.yaml not found")
    data = yaml_load(registry) or {}
    guards = data.get("guards") or []
    if len(guards) <= 0:
        pytest.skip("no guards in registry")

    tested = 0
    for guard in guards:
        gid = str(guard.get("id", ""))
        anchor = str(guard.get("anchor", ""))
        applies = guard.get("applies_to") or []
        files_str = ",".join(str(x) for x in applies)
        for f in files_str.split(","):
            f = f.replace(" ", "")
            if not f:
                continue
            tested += 1
            text = _read(repo_root / f)
            assert anchor in text, f"Guard '{gid}': anchor '{anchor}' NOT found in {f}"

    # Positiv-Anker: mindestens 1 (anchor, datei)-Paar geprueft
    assert tested > 0


def test_keine_stalen_modell_slugs_in_den_flow_skills(repo_root):
    pattern = re.compile(
        r"gemma[0-9a-z-]*-factory|gemma[0-9]+-[a-z]+|gptoss-[a-z]+|devstral-[a-z]+|qwen[0-9a-z-]+"
    )
    candidates = ""
    for skill in (
        repo_root / ".claude/skills/dev-flow-plan/SKILL.md",
        repo_root / ".opencode/skills/dev-flow-plan/SKILL.md",
    ):
        if skill.is_file():
            candidates += "".join(m.group(0) + "\n" for m in pattern.finditer(_read(skill)))
            candidates += "\n"

    # Positiv-Anker: Kandidatenliste ist nicht leer
    assert candidates != ""

    slugs = sorted(set(candidates.split()))
    loadouts = _read(repo_root / "scripts/llm/loadouts.json")
    agent_models = _read(repo_root / ".opencode/agent-models.jsonc")
    for slug in slugs:
        if slug in loadouts or slug in agent_models:
            continue
        pytest.fail(
            f"stale model slug '{slug}' found in skill but not in loadouts.json or agent-models.jsonc"
        )
