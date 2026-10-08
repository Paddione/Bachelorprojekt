"""Tests for dev-flow-e2e skill contract (migrated from tests/spec/dev-flow-e2e.bats)."""

from pathlib import Path
import re


def test_dev_flow_e2e_skill_contract(repo_root: Path):
    skill = repo_root / ".agents" / "skills" / "dev-flow-e2e" / "SKILL.md"
    content = skill.read_text()

    assert re.search(r"^agent:\s*bp-ship", content, re.M)
    assert "AFTER dev-flow-execute has merged and deployed" in content

    # git and branching conventions
    assert re.search(r"(`test/\*`|test/\*)-Branches sind nicht erlaubt", content)
    assert re.search(r"E2E-Branches nutzen.*`chore/`|ticketed.*`chore/`", content)
    assert "Scope 'test' verwenden — 'e2e' lehnt validate-commit-msg ab" in content
    assert "test(test): add E2E tests for" in content

    # execution dir and env
    assert "cd tests/e2e/" in content
    assert "[[ -x ./node_modules/.bin/playwright ]] || npm ci" in content
    assert "SKIP_DB_PURGE=1" in content

    # tag annotations
    assert "PFLICHT: Tag-Annotation für den PR-E2E-Workflow" in content
    assert re.search(r"test\.describe.*tag:", content)
    assert "@smoke @website @content-hub @admin @factory" in content

    # headed verify
    assert "Explizit optional — kein Pflichtschritt, kein CI-Gate" in content
    assert "k8-headed-verify.spec.ts" in content
    assert "8094" in content
    assert "8091" in content

    # handoff & framework mapping
    assert "mishap-tracker" in content
    assert "operations-management" in content
    assert "## Framework mapping" in content
    assert "**Claude Code**" in content
    assert "**opencode**" in content
    assert "**agy**" in content
