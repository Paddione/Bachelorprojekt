"""Native assertions from tests/spec/ci-cd/actionlint-workflow-gate.bats."""

import os
import re
import shutil
import pytest

@pytest.fixture
def lint(repo_root):
    if not shutil.which("actionlint"):
        pytest.skip("actionlint binary not installed")
    script = repo_root / "scripts/lint-workflows.sh"
    assert script.is_file()
    return script


def fixture_repo(repo_root, run_cmd, directory, condition=None, runner="ubuntu-latest"):
    (directory / ".github/workflows").mkdir(parents=True)
    if condition is None:
        steps = "      - run: echo ok\n"
    else:
        steps = f'      - id: detect\n        run: echo "count=1" >> "$GITHUB_OUTPUT"\n      - if: {condition}\n        run: echo ok\n'
    (directory / ".github/workflows/fixture.yml").write_text(f"name: Fixture\non: push\njobs:\n  a:\n    runs-on: {runner}\n    steps:\n" + steps)
    config = repo_root / ".github/actionlint.yaml"
    if config.is_file():
        shutil.copy(config, directory / ".github/actionlint.yaml")
    run_cmd(["git", "init", "-q", "."], cwd=directory).check()


def test_lint_script_exists_executable(repo_root):
    script = repo_root / "scripts/lint-workflows.sh"
    assert script.is_file()
    assert os.access(script, os.X_OK)


def test_real_workflows_lint_cleanly(lint, run_cmd):
    run_cmd(["bash", str(lint)]).check()


def test_lint_rejects_secrets_in_step_if(lint, repo_root, run_cmd, tmp_path):
    clean = tmp_path / "clean"
    fixture_repo(repo_root, run_cmd, clean, "steps.detect.outputs.count != '0'")
    run_cmd(["bash", str(lint)], cwd=clean).check()
    broken = tmp_path / "broken"
    fixture_repo(repo_root, run_cmd, broken, "steps.detect.outputs.count != '0' && secrets.FOO != ''")
    result = run_cmd(["bash", str(lint)], cwd=broken)
    assert result.returncode != 0
    assert "secrets" in result.output


def test_lint_accepts_fleet_gpu_label(lint, repo_root, run_cmd, tmp_path):
    fixture_repo(repo_root, run_cmd, tmp_path / "selfhosted", runner="[self-hosted, fleet-gpu]")
    run_cmd(["bash", str(lint)], cwd=tmp_path / "selfhosted").check()


def test_task_lint_workflows_registered(run_cmd):
    anchor = run_cmd(["task", "--summary", "test:all"])
    if anchor.returncode:
        pytest.skip("task-Binary nicht verfuegbar oder Taskfile defekt (Anker rot)")
    run_cmd(["task", "--summary", "lint:workflows"]).check()


def test_ci_calls_workflow_lint(repo_root):
    source = (repo_root / ".github/workflows/ci.yml").read_text()
    assert "BATS Unit + Quality Gates" in source
    assert "lint-workflows.sh" in source


def test_ci_actionlint_version_pinned(repo_root):
    source = (repo_root / ".github/workflows/ci.yml").read_text()
    assert "actionlint" in source
    assert any(re.search(r"actionlint[/_-]v?[0-9]+\.[0-9]+\.[0-9]+", line) for line in source.splitlines() if "actionlint" in line)
