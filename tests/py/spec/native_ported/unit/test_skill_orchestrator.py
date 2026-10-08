"""Native migration of tests/unit/skill-orchestrator.bats."""
from pathlib import Path

import pytest

SKILL_FRONTMATTER = """---
name: test-skill
hooks:
  pre:
    - test-pre-hook
  post:
    - test-post-hook
---
# Test Skill
"""


@pytest.fixture
def orchestrator(repo_root: Path, tmp_path: Path) -> Path:
    """Copy scripts/skill-orchestrator.sh with its hook directory redirected into tmp_path."""
    hooks_dir = tmp_path / "scripts" / "hooks"
    hooks_dir.mkdir(parents=True)
    (hooks_dir / "test-pre-hook.sh").write_text('echo "pre-hook-executed"\n', encoding="utf-8")
    (hooks_dir / "test-post-hook.sh").write_text('echo "post-hook-executed"\n', encoding="utf-8")
    for hook in hooks_dir.glob("*.sh"):
        hook.chmod(0o755)

    source = (repo_root / "scripts" / "skill-orchestrator.sh").read_text(encoding="utf-8")
    target = tmp_path / "skill-orchestrator.sh"
    target.write_text(source.replace("scripts/hooks/", f"{hooks_dir}/"), encoding="utf-8")
    target.chmod(0o755)
    return target


@pytest.fixture
def skill_file(tmp_path: Path) -> Path:
    path = tmp_path / "test-skill.md"
    path.write_text(SKILL_FRONTMATTER, encoding="utf-8")
    return path


def test_orchestrator_parses_and_executes_pre_hooks(run_cmd, orchestrator, skill_file):
    result = run_cmd(["bash", str(orchestrator), str(skill_file), "pre"])
    assert result.returncode == 0, result.output
    assert "pre-hook-executed" in result.output
    assert "post-hook-executed" not in result.output


def test_orchestrator_parses_and_executes_post_hooks(run_cmd, orchestrator, skill_file):
    result = run_cmd(["bash", str(orchestrator), str(skill_file), "post"])
    assert result.returncode == 0, result.output
    assert "post-hook-executed" in result.output
    assert "pre-hook-executed" not in result.output


def test_orchestrator_handles_missing_hook_scripts_gracefully(run_cmd, orchestrator, skill_file):
    # sed '/test-pre-hook/a \    - non-existent-hook' on the skill file
    lines = skill_file.read_text(encoding="utf-8").splitlines(keepends=True)
    out = []
    for line in lines:
        out.append(line)
        if "test-pre-hook" in line:
            out.append("    - non-existent-hook\n")
    skill_file.write_text("".join(out), encoding="utf-8")

    result = run_cmd(["bash", str(orchestrator), str(skill_file), "pre"])
    assert result.returncode == 0, result.output
    assert "pre-hook-executed" in result.output
