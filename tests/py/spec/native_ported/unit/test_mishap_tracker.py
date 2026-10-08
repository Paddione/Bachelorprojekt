"""Native migration of tests/unit/mishap-tracker.bats."""
import os
import shutil
from pathlib import Path

import pytest

KUBECTL_MOCK = """#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then cat >> "{capfile}"; echo ""; exit 0; fi
exit 0
"""


@pytest.fixture
def tracker(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "hooks" / "mishap-tracker.sh")


@pytest.fixture
def categorize_script(repo_root: Path) -> Path:
    return repo_root / "scripts" / "mishap-categorize.sh"


@pytest.fixture
def categorize_env(repo_root: Path, categorize_script: Path, tmp_path: Path) -> dict:
    """Equivalent of _categorize_setup: mock dir with script, keywords and a kubectl mock on PATH."""
    mockdir = tmp_path / "mock"
    mockdir.mkdir()
    shutil.copy(repo_root / "scripts" / "mishap-keywords.json", mockdir / "mishap-keywords.json")
    shutil.copy(categorize_script, mockdir / "mishap-categorize.sh")
    capfile = mockdir / "captured.sql"
    kubectl = mockdir / "kubectl"
    kubectl.write_text(KUBECTL_MOCK.replace("{capfile}", str(capfile)), encoding="utf-8")
    kubectl.chmod(0o755)
    return {
        "mockdir": mockdir,
        "capfile": capfile,
        "env": {"PATH": f"{mockdir}{os.pathsep}{os.environ.get('PATH', '')}", "CAPFILE": str(capfile), "MOCKDIR": str(mockdir)},
    }


def test_no_ticket_writes_to_mishaps_log(run_cmd, tracker, tmp_path):
    result = run_cmd(["bash", tracker, "--friction", "ENV var missing", "--severity", "minor"], cwd=tmp_path)
    assert result.returncode == 0, result.output
    log = tmp_path / ".mishaps.log"
    assert log.is_file()
    content = log.read_text(encoding="utf-8")
    assert "ENV var missing" in content
    assert "minor" in content


def test_missing_friction_fails_with_usage(run_cmd, tracker, tmp_path):
    result = run_cmd(["bash", tracker, "--severity", "major"], cwd=tmp_path)
    assert result.returncode != 0
    assert "--friction is required" in result.output


def test_default_severity_is_minor(run_cmd, tracker, tmp_path):
    result = run_cmd(["bash", tracker, "--friction", "no severity given"], cwd=tmp_path)
    assert result.returncode == 0, result.output
    assert "minor" in (tmp_path / ".mishaps.log").read_text(encoding="utf-8")


def test_categorize_requires_3_args(run_cmd, categorize_script, tmp_path):
    result = run_cmd(["bash", str(categorize_script), "T001"], cwd=tmp_path)
    assert result.returncode == 0, result.output
    assert "Usage" in result.output


def test_categorize_empty_title_plus_description_is_sonstige(run_cmd, categorize_env, tmp_path):
    result = run_cmd(
        ["bash", str(categorize_env["mockdir"] / "mishap-categorize.sh"), "T001", "", ""],
        cwd=tmp_path, env=categorize_env["env"],
    )
    assert result.returncode == 0, result.output
    assert "Sonstige" in result.output


def test_categorize_ci_konflikt_via_keyword_merge_conflict(run_cmd, categorize_env, tmp_path):
    result = run_cmd(
        ["bash", str(categorize_env["mockdir"] / "mishap-categorize.sh"), "T002",
         "CI merge conflict on PR", "CONFLICTING state blocked rebase"],
        cwd=tmp_path, env=categorize_env["env"],
    )
    assert result.returncode == 0, result.output
    assert "CI-Konflikt" in result.output


def test_categorize_deploy_fehler_via_keyword_crashloopbackoff(run_cmd, categorize_env, tmp_path):
    result = run_cmd(
        ["bash", str(categorize_env["mockdir"] / "mishap-categorize.sh"), "T003",
         "Pod CrashLoopBackOff", "rollout failed with ErrImagePull"],
        cwd=tmp_path, env=categorize_env["env"],
    )
    assert result.returncode == 0, result.output
    assert "Deploy-Fehler" in result.output


def test_categorize_sonstige_when_no_keyword_matches(run_cmd, categorize_env, tmp_path):
    result = run_cmd(
        ["bash", str(categorize_env["mockdir"] / "mishap-categorize.sh"), "T004",
         "random stuff", "nothing matches any keyword here"],
        cwd=tmp_path, env=categorize_env["env"],
    )
    assert result.returncode == 0, result.output
    assert "Sonstige" in result.output


def test_categorize_db_insert_called_with_correct_category_kind_tag(run_cmd, categorize_env, tmp_path):
    result = run_cmd(
        ["bash", str(categorize_env["mockdir"] / "mishap-categorize.sh"), "T005",
         "API 429 rate limit timeout", "upstream connection refused"],
        cwd=tmp_path, env=categorize_env["env"],
    )
    assert result.returncode == 0, result.output
    assert "API-Fehler" in result.output
    capfile = categorize_env["capfile"]
    if capfile.is_file():
        captured = capfile.read_text(encoding="utf-8")
        assert "INSERT INTO tickets.tags" in captured
        assert "INSERT INTO tickets.ticket_tags" in captured
